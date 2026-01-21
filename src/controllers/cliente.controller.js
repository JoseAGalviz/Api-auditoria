import fetch from "node-fetch";
import { sql, getAppPool, getMysqlPool } from "../config/database.js";

/**
 * Obtener lista de compañías desde Bitrix24
 * @route GET /api/clientes/companies
 */
export const getBitrixCompanies = async (req, res) => {
    try {
        const BITRIX_URL = "https://b24-sjdauj.bitrix24.es/rest/5149/qly93wxo8xvetemt/crm.company.list.json";
        const BITRIX_FIELDS_URL = "https://b24-sjdauj.bitrix24.es/rest/5149/qly93wxo8xvetemt/crm.company.fields.json";

        const targetFields = [
            "UF_CRM_1634787828",
            "UF_CRM_1635903069",
            "UF_CRM_1638457710",
            "UF_CRM_1651251237102",
            "UF_CRM_1686015739936"
        ];

        const fieldsToSelect = [
            "ID",
            "TITLE",
            ...targetFields
        ];

        const { start } = req.query;

        // Fetch companies and fields definitions in parallel using the same webhook
        const [companiesResponse, fieldsResponse] = await Promise.all([
            fetch(BITRIX_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    select: fieldsToSelect,
                    filter: { "!UF_CRM_1638457710": ["921", "3135"] },
                    start: start ? parseInt(start) : 0
                })
            }),
            fetch(BITRIX_FIELDS_URL)
        ]);

        const [companiesData, fieldsDefinitions] = await Promise.all([
            companiesResponse.json(),
            fieldsResponse.json()
        ]);

        if (!companiesData.result || !fieldsDefinitions.result) {
            console.error("Bitrix24 Error:", { companies: companiesData, fields: fieldsDefinitions });
            throw new Error("Error al obtener datos de Bitrix24 (Compañías o Campos)");
        }

        // Create a map of Field Name -> { ID -> Value }
        const fieldMaps = {};

        targetFields.forEach(fieldName => {
            if (fieldsDefinitions.result[fieldName] && fieldsDefinitions.result[fieldName].items) {
                const map = {};
                fieldsDefinitions.result[fieldName].items.forEach(item => {
                    map[item.ID] = item.VALUE;
                });
                fieldMaps[fieldName] = map;
            } else if (fieldsDefinitions.result[fieldName] && fieldsDefinitions.result[fieldName].LIST) {
                // Sometimes it might come as LIST
                const map = {};
                fieldsDefinitions.result[fieldName].LIST.forEach(item => {
                    map[item.ID] = item.VALUE;
                });
                fieldMaps[fieldName] = map;
            }
        });

        // Map the company data and clean values
        const mappedCompanies = companiesData.result.map(company => {
            const newCompany = { ...company };
            targetFields.forEach(field => {
                if (newCompany[field] && fieldMaps[field]) {
                    const rawValue = newCompany[field];
                    // Handle single value or array of values (if multiple selection is allowed)
                    if (Array.isArray(rawValue)) {
                        newCompany[field] = rawValue.map(id => {
                            const val = fieldMaps[field][id] || id;
                            return typeof val === 'string' ? val.trim() : val;
                        });
                    } else {
                        const val = fieldMaps[field][rawValue] || rawValue;
                        newCompany[field] = typeof val === 'string' ? val.trim() : val;
                    }
                } else if (typeof newCompany[field] === 'string') {
                    // Try to trim even if not mapped (e.g. if fieldMaps failed or raw value used)
                    newCompany[field] = newCompany[field].trim();
                }
            });

            // Clean other fields like TITLE
            if (newCompany.TITLE) newCompany.TITLE = newCompany.TITLE.trim();

            return newCompany;
        });

        // 2. Integration with Profit (SQL Server)
        const clientCodes = mappedCompanies
            .map(c => c.UF_CRM_1634787828)
            .filter(code => code); // Filter out empty/null codes

        let profitDataMap = {};

        if (clientCodes.length > 0) {
            try {
                const pool = await sql.connect();
                // Create a parameterized query for IN clause is tricky in mssql with simple strings, 
                // but since we controlled the input (cleaned codes), we can try to be safe or use a TVP if mostly safe.
                // However, `input` with many parameters is standard.

                // For simplicity with this library and dynamic lists, we construct the parameter list.
                const reqPool = pool.request();
                const paramNames = clientCodes.map((_, index) => `code${index}`);

                clientCodes.forEach((code, index) => {
                    reqPool.input(`code${index}`, code);
                });

                const query = `
                    DECLARE @Today DATETIME = GETDATE();
                    DECLARE @FirstDayMonth DATETIME = DATEFROMPARTS(YEAR(@Today), MONTH(@Today), 1);
                    DECLARE @FirstDayNextMonth DATETIME = DATEADD(MONTH, 1, @FirstDayMonth);
                    DECLARE @FirstDayLastMonth DATETIME = DATEADD(MONTH, -1, @FirstDayMonth);
                    
                    -- Query 1: Clientes básicos
                    SELECT co_cli, login, horar_caja 
                    FROM clientes WITH (NOLOCK)
                    WHERE co_cli IN (${paramNames.map(p => `@${p}`).join(',')});
                    
                    -- Query 2: Datos consolidados usando CROSS APPLY (más eficiente que CTEs + LEFT JOIN)
                    SELECT 
                        c.co_cli,
                        -- Saldos desde factura
                        ISNULL(f.total_trancito, 0) AS total_trancito,
                        ISNULL(f.total_vencido, 0) AS total_vencido,
                        f.fecha_ultima_compra,
                        -- Morosidad
                        m.nro_doc,
                        m.factura_mayor_morosidad,
                        -- Cobros
                        cob.cob_num,
                        cob.ultimo_cobro,
                        -- SKU
                        ISNULL(sku.sku_mes, 0) AS sku_mes,
                        -- Ventas
                        ISNULL(vm_actual.ventas_mes_actual, 0) AS ventas_mes_actual,
                        ISNULL(vm_pasado.ventas_mes_pasado, 0) AS ventas_mes_pasado
                    FROM (SELECT DISTINCT co_cli FROM clientes WHERE co_cli IN (${paramNames.map(p => `@${p}`).join(',')})) c
                    -- Facturas: saldos y fecha última compra
                    OUTER APPLY (
                        SELECT 
                            ROUND(SUM(CASE 
                                WHEN fec_venc >= @Today AND saldo > 0 
                                THEN saldo / NULLIF(tasa, 0)
                                ELSE 0 
                            END), 2) AS total_trancito,
                            ROUND(SUM(CASE 
                                WHEN fec_venc < @Today AND saldo > 0 
                                THEN saldo / NULLIF(tasa, 0)
                                ELSE 0 
                            END), 2) AS total_vencido,
                            MAX(fec_emis) AS fecha_ultima_compra
                        FROM factura WITH (NOLOCK)
                        WHERE co_cli = c.co_cli AND anulada = 0
                    ) f
                    -- Morosidad: factura con mayor saldo
                    OUTER APPLY (
                        SELECT TOP 1 fact_num AS nro_doc, fec_emis AS factura_mayor_morosidad
                        FROM factura WITH (NOLOCK)
                        WHERE co_cli = c.co_cli
                        AND saldo > 0 
                        AND anulada = 0
                        ORDER BY fec_venc ASC
                    ) m
                    -- Cobros: último cobro
                    OUTER APPLY (
                        SELECT TOP 1 cob_num, fec_cob AS ultimo_cobro
                        FROM cobros WITH (NOLOCK)
                        WHERE co_cli = c.co_cli AND anulado = 0
                        ORDER BY fec_cob DESC
                    ) cob
                    -- SKU del mes actual
                    OUTER APPLY (
                        SELECT COUNT(DISTINCT rf.co_art) AS sku_mes
                        FROM factura f WITH (NOLOCK)
                        INNER JOIN reng_fac rf WITH (NOLOCK) ON rf.fact_num = f.fact_num
                        WHERE f.co_cli = c.co_cli
                        AND f.anulada = 0
                        AND f.fec_emis >= @FirstDayMonth
                        AND f.fec_emis < @FirstDayNextMonth
                    ) sku
                    -- Ventas mes actual
                    OUTER APPLY (
                        SELECT ROUND(SUM(tot_neto / NULLIF(tasa, 0)), 2) AS ventas_mes_actual
                        FROM factura WITH (NOLOCK)
                        WHERE co_cli = c.co_cli
                        AND anulada = 0
                        AND fec_emis >= @FirstDayMonth
                        AND fec_emis < @FirstDayNextMonth
                    ) vm_actual
                    -- Ventas mes pasado
                    OUTER APPLY (
                        SELECT ROUND(SUM(tot_neto / NULLIF(tasa, 0)), 2) AS ventas_mes_pasado
                        FROM factura WITH (NOLOCK)
                        WHERE co_cli = c.co_cli
                        AND anulada = 0
                        AND fec_emis >= @FirstDayLastMonth
                        AND fec_emis < @FirstDayMonth
                    ) vm_pasado;
                `;

                const result = await reqPool.query(query);

                // Result 1: Clientes
                result.recordsets[0].forEach(row => {
                    const key = typeof row.co_cli === 'string' ? row.co_cli.trim() : row.co_cli;
                    if (!profitDataMap[key]) profitDataMap[key] = {};
                    // Asignar en el orden especificado
                    profitDataMap[key].login = typeof row.login === 'string' ? row.login.trim() : row.login;
                    profitDataMap[key].horar_caja = typeof row.horar_caja === 'string' ? row.horar_caja.trim() : row.horar_caja;
                });

                // Result 2: Consolidated data (Facturas, Morosidad, Cobros, SKU, Ventas)
                if (result.recordsets.length > 1) {
                    result.recordsets[1].forEach(row => {
                        const key = typeof row.co_cli === 'string' ? row.co_cli.trim() : row.co_cli;
                        if (!profitDataMap[key]) profitDataMap[key] = {};

                        // Orden específico de los campos
                        // 1. login (ya asignado en Result 1)

                        // 2. Saldo Tránsito
                        profitDataMap[key].saldo_trancito = row.total_trancito;

                        // 3. Saldo Vencido
                        profitDataMap[key].saldo_vencido = row.total_vencido;

                        // 4. Fecha Última Compra
                        profitDataMap[key].fecha_ultima_compra = row.fecha_ultima_compra
                            ? new Date(row.fecha_ultima_compra).toISOString().split('T')[0]
                            : null;

                        // 5. Factura Mayor Morosidad (Solo el número)
                        if (row.nro_doc) {
                            const nroDoc = typeof row.nro_doc === 'string' ? row.nro_doc.trim() : row.nro_doc;
                            profitDataMap[key].factura_mayor_morosidad = nroDoc;
                        } else {
                            profitDataMap[key].factura_mayor_morosidad = null;
                        }

                        // 6. Último Cobro (Fecha)
                        profitDataMap[key].ultimo_cobro = row.ultimo_cobro
                            ? new Date(row.ultimo_cobro).toISOString().split('T')[0]
                            : null;

                        // 7. SKU Mes
                        profitDataMap[key].sku_mes = row.sku_mes || 0;

                        // 8. horar_caja (ya asignado en Result 1)

                        // 9. Ventas Mes Actual
                        profitDataMap[key].ventas_mes_actual = row.ventas_mes_actual || 0;

                        // 10. Ventas Mes Pasado
                        profitDataMap[key].ventas_mes_pasado = row.ventas_mes_pasado || 0;
                    });
                }

            } catch (dbError) {
                console.error("Error connecting/querying Profit:", dbError);
                // We don't fail the whole request, just return empty profit data or null
            }
        }

        const appPool = getAppPool();
        const auditoriaPool = getMysqlPool(); // Pool para la DB auditoria
        const gestionesMap = {};
        const auditoriaMap = {};

        // Fetch Auditoria data (bitacora)
        if (auditoriaPool && clientCodes.length > 0) {
            try {
                const placeholders = clientCodes.map(() => '?').join(',');
                const query = `
                    SELECT codigo_profit, bitacora 
                    FROM registros_auditoria 
                    WHERE codigo_profit IN (${placeholders})
                `;
                const [rows] = await auditoriaPool.query(query, clientCodes);
                rows.forEach(row => {
                    if (row.codigo_profit) {
                        auditoriaMap[row.codigo_profit.trim()] = row.bitacora;
                    }
                });
            } catch (auditoriaError) {
                console.error("Error querying Auditoria Database:", auditoriaError);
            }
        }

        if (appPool && clientCodes.length > 0) {
            try {
                // MySQL supports IN clause with ? params.
                const placeholders = clientCodes.map(() => '?').join(',');

                // Get all gestiones from current week per client
                const query = `
                  SELECT 
                    co_cli, 
                    tipos, 
                    venta_tipoGestion, 
                    venta_descripcion, 
                    cobranza_tipoGestion, 
                    cobranza_descripcion,
                    fecha_registro,
                    CASE DAYOFWEEK(CONVERT_TZ(fecha_registro, '+00:00', '-04:00'))
                      WHEN 1 THEN 'Domingo'
                      WHEN 2 THEN 'Lunes'
                      WHEN 3 THEN 'Martes'
                      WHEN 4 THEN 'Miércoles'
                      WHEN 5 THEN 'Jueves'
                      WHEN 6 THEN 'Viernes'
                      WHEN 7 THEN 'Sábado'
                    END as dia_semana
                  FROM gestiones
                  WHERE co_cli IN (${placeholders})
                    AND YEARWEEK(CONVERT_TZ(fecha_registro, '+00:00', '-04:00'), 1) = YEARWEEK(CURDATE(), 1)
                  ORDER BY fecha_registro DESC
                `;

                const [rows] = await appPool.query(query, clientCodes);

                rows.forEach(row => {
                    if (row.co_cli) {
                        const key = row.co_cli.trim();
                        if (!gestionesMap[key]) {
                            gestionesMap[key] = [];
                        }
                        gestionesMap[key].push({
                            tipos: row.tipos,
                            venta_tipoGestion: row.venta_tipoGestion,
                            venta_descripcion: row.venta_descripcion,
                            cobranza_tipoGestion: row.cobranza_tipoGestion,
                            cobranza_descripcion: row.cobranza_descripcion,
                            fecha_registro: row.fecha_registro,
                            dia_semana: row.dia_semana
                        });
                    }
                });

            } catch (appError) {
                console.error("Error connecting/querying App Database:", appError);
            }
        }

        // 3. Merge Data
        const finalData = mappedCompanies.map(bitrixCompany => {
            const clientCode = bitrixCompany.UF_CRM_1634787828;

            const profitData = profitDataMap[clientCode];
            const appData = gestionesMap[clientCode];
            const bitacora = auditoriaMap[clientCode] || null;

            // Construir objeto profit con orden específico
            let profitInfo = null;
            if (profitData) {
                profitInfo = {
                    login: profitData.login || null,
                    saldo_trancito: profitData.saldo_trancito || 0,
                    saldo_vencido: profitData.saldo_vencido || 0,
                    fecha_ultima_compra: profitData.fecha_ultima_compra || null,
                    factura_mayor_morosidad: profitData.factura_mayor_morosidad || null,
                    ultimo_cobro: profitData.ultimo_cobro || null,
                    sku_mes: profitData.sku_mes || 0,
                    horar_caja: profitData.horar_caja || "",
                    ventas_mes_actual: profitData.ventas_mes_actual || 0,
                    ventas_mes_pasado: profitData.ventas_mes_pasado || 0
                };
            }

            const gestionInfo = appData ? appData.map(gestion => ({
                tipos: gestion.tipos ? JSON.parse(gestion.tipos) : [],
                venta_tipoGestion: gestion.venta_tipoGestion,
                venta_descripcion: gestion.venta_descripcion,
                cobranza_tipoGestion: gestion.cobranza_tipoGestion,
                cobranza_descripcion: gestion.cobranza_descripcion,
                fecha_registro: gestion.fecha_registro
                    ? new Date(gestion.fecha_registro).toISOString().replace('T', ' ').substring(0, 19)
                    : null,
                dia_semana: gestion.dia_semana || null
            })) : [];

            return {
                bitrix: bitrixCompany,
                profit: profitInfo,
                gestion: gestionInfo,
                bitacora: bitacora
            };
        });

        res.json({
            success: true,
            count: finalData.length,
            total: companiesData.total,
            next: companiesData.next,
            data: finalData
        });

    } catch (error) {
        console.error("Error en getBitrixCompanies:", error);
        res.status(500).json({
            error: "Error al obtener compañías de Bitrix24",
            details: error.message
        });
    }
};

/**
 * Obtener TODAS las compañías desde Bitrix24 (Optimizado con Batch)
 * @route GET /api/clientes/companies/all
 */
export const getAllBitrixCompanies = async (req, res) => {
    try {
        const { segmentos } = req.body || {};

        const BITRIX_BATCH_URL = "https://b24-sjdauj.bitrix24.es/rest/5149/qly93wxo8xvetemt/batch.json";
        const BITRIX_FIELDS_URL = "https://b24-sjdauj.bitrix24.es/rest/5149/qly93wxo8xvetemt/crm.company.fields.json";
        const BITRIX_LIST_URL = "https://b24-sjdauj.bitrix24.es/rest/5149/qly93wxo8xvetemt/crm.company.list.json";

        const targetFields = [
            "UF_CRM_1634787828",
            "UF_CRM_1635903069",
            "UF_CRM_1638457710",
            "UF_CRM_1651251237102",
            "UF_CRM_1686015739936"
        ];

        // Filtro para excluir ciertos tipos de clientes (Igual que en getBitrixCompanies)
        const BITRIX_FILTER = { "!UF_CRM_1638457710": ["921", "3135"] };

        const fieldsToSelect = [
            "ID",
            "TITLE",
            ...targetFields
        ];

        console.log("🚀 Iniciando consulta OPTIMIZADA (BatchStrategy)...");
        const startTime = Date.now();

        // 1. Obtener definiciones de campos y Total de registros en paralelo
        const [fieldsResponse, countResponse] = await Promise.all([
            fetch(BITRIX_FIELDS_URL),
            fetch(BITRIX_LIST_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    select: ["ID"], // Solo ID para ser ligero
                    filter: BITRIX_FILTER,
                    start: 0
                })
            })
        ]);
        // 
        const fieldsDefinitions = await fieldsResponse.json();
        const countData = await countResponse.json();

        if (!fieldsDefinitions.result || !countData.result) {
            throw new Error("Error al obtener metadatos iniciales de Bitrix24");
        }

        const totalRecords = countData.total;
        console.log(`📊 Total de compañías a obtener: ${totalRecords}`);

        // Crear mapeo de campos
        const fieldMaps = {};
        targetFields.forEach(fieldName => {
            if (fieldsDefinitions.result[fieldName] && fieldsDefinitions.result[fieldName].items) {
                const map = {};
                fieldsDefinitions.result[fieldName].items.forEach(item => {
                    map[item.ID] = item.VALUE;
                });
                fieldMaps[fieldName] = map;
            } else if (fieldsDefinitions.result[fieldName] && fieldsDefinitions.result[fieldName].LIST) {
                const map = {};
                fieldsDefinitions.result[fieldName].LIST.forEach(item => {
                    map[item.ID] = item.VALUE;
                });
                fieldMaps[fieldName] = map;
            }
        });

        // 2. Preparar Batches
        // Bitrix permite max 50 comandos por batch. Cada comando trae 50 registros.
        // Total por request batch = 50 * 50 = 2500 registros.
        const RECORDS_PER_CMD = 50;
        const CMDS_PER_BATCH = 50;
        const RECORDS_PER_BATCH = RECORDS_PER_CMD * CMDS_PER_BATCH;

        const totalBatches = Math.ceil(totalRecords / RECORDS_PER_BATCH);
        let allCompanies = [];

        console.log(`⚡ Se ejecutarán ${totalBatches} peticiones Batch (cada una trae ~2500 registros)`);

        // Función para ejecutar un batch
        const fetchBatch = async (batchIndex) => {
            const batchCommands = {};
            const startOffset = batchIndex * RECORDS_PER_BATCH;

            for (let i = 0; i < CMDS_PER_BATCH; i++) {
                const cmdStart = startOffset + (i * RECORDS_PER_CMD);
                if (cmdStart >= totalRecords) break;

                // Sintaxis de comando batch: 'cmd_name': 'method?param1=val&param2=val'
                // Ojo: Bitrix batch params con array pueden ser tricky en string query, usamos post body structure en el fetch
                // Pero el endpoint batch espera un objeto `cmd` con strings de queries.
                // Ejemplo: "get_0": "crm.company.list?start=0&select[]=ID&select[]=TITLE..."

                // Construir query string manualmente para asegurar array params
                const selectParams = fieldsToSelect.map(f => `select[]=${f}`).join('&');

                // Construir query params para el filtro (array exclusion)
                // filter[!field][]=val1&filter[!field][]=val2
                const filterKey = "!UF_CRM_1638457710";
                const filterValues = ["921", "3135"];
                const filterParams = filterValues.map(val => `filter[${filterKey}][]=${val}`).join('&');

                batchCommands[`cmd_${i}`] = `crm.company.list?start=${cmdStart}&${selectParams}&${filterParams}`;
            }

            if (Object.keys(batchCommands).length === 0) return [];

            const response = await fetch(BITRIX_BATCH_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    halt: 0, // No detener si hay error en un comando
                    cmd: batchCommands
                })
            });

            const data = await response.json();
            if (!data.result || !data.result.result) {
                console.error(`Error en Batch ${batchIndex}`, data);
                return [];
            }

            // Aplanar resultados del objeto result
            return Object.values(data.result.result).flat();
        };

        // Ejecutar batches (Controlando concurrencia si fueran muchos, pero aquí son pocos)
        // Para 11,000 registros son solo ~5 requests. Podemos lanzarlos todos o de 2 en 2.
        // Vamos a lanzarlos en paralelo con Promise.all si son pocos, o en chunks si creciera mucho.
        const batchPromises = [];
        for (let i = 0; i < totalBatches; i++) {
            batchPromises.push(fetchBatch(i));
        }

        const results = await Promise.all(batchPromises);
        results.forEach(batchRes => {
            allCompanies = allCompanies.concat(batchRes);
        });

        console.log(`✅ Descarga completada: ${allCompanies.length} registros en ${(Date.now() - startTime) / 1000}s`);

        // 3. Procesar datos (Mapeo de campos)
        const mappedCompanies = allCompanies.map(company => {
            const newCompany = { ...company };
            targetFields.forEach(field => {
                if (newCompany[field] && fieldMaps[field]) {
                    const rawValue = newCompany[field];
                    if (Array.isArray(rawValue)) {
                        newCompany[field] = rawValue.map(id => {
                            const val = fieldMaps[field][id] || id;
                            return typeof val === 'string' ? val.trim() : val;
                        });
                    } else {
                        const val = fieldMaps[field][rawValue] || rawValue;
                        newCompany[field] = typeof val === 'string' ? val.trim() : val;
                    }
                } else if (typeof newCompany[field] === 'string') {
                    newCompany[field] = newCompany[field].trim();
                }
            });
            if (newCompany.TITLE) newCompany.TITLE = newCompany.TITLE.trim();
            return newCompany;
        });

        // 4. Integración con Profit (SQL Server) - CON CURSOR OPTIMIZADO POR LOTES
        // Normalizamos usando un Map para eliminar duplicados (Case Insensitive y Trim)
        // Esto evita errores de Primary Key en SQL Server si vienen 'Code1' y 'code1'
        const uniqueCodesMap = new Map();

        mappedCompanies.forEach(c => {
            const rawCode = c.UF_CRM_1634787828;
            if (rawCode) {
                const cleanCode = String(rawCode).trim();
                const key = cleanCode.toUpperCase(); // Clave normalizada para deduplicar
                if (!uniqueCodesMap.has(key)) {
                    uniqueCodesMap.set(key, cleanCode);
                }
            }
        });

        const clientCodes = Array.from(uniqueCodesMap.values());
        let profitDataMap = {};
        let gestionesMap = {};

        // 4. Función para obtener datos de Profit
        const fetchProfit = async () => {
            const innerProfitMap = {};
            if (clientCodes.length === 0) return innerProfitMap;

            try {
                console.log(`📊 Consultando Profit para ${clientCodes.length} clientes...`);
                const pool = await sql.connect();

                const BATCH_SIZE = 900;
                const batches = [];
                for (let i = 0; i < clientCodes.length; i += BATCH_SIZE) {
                    batches.push(clientCodes.slice(i, i + BATCH_SIZE));
                }

                console.log(`  Procesando en ${batches.length} lote(s) SQL...`);
                // Limitamos a 2 simultáneos para no saturar el pool de SQL
                const processBatchSQL = async (batch) => {
                    const localPool = await sql.connect(); // Reutiliza pool global
                    const reqPool = localPool.request();

                    // Crear tabla temporal de clientes para este batch
                    const values = batch.map(code => `('${code}')`).join(',');

                    let segmentCondition = "";
                    if (segmentos && Array.isArray(segmentos) && segmentos.length > 0) {
                        const segValues = segmentos.map(s => `'${String(s).trim().replace(/'/g, "''")}'`).join(',');
                        segmentCondition = `WHERE c.co_seg IN (${segValues})`;
                    }

                    const query = `
                        SET NOCOUNT ON;

                        DECLARE @Today DATETIME = GETDATE();
                        DECLARE @FirstDayMonth DATETIME = DATEFROMPARTS(YEAR(@Today), MONTH(@Today), 1);
                        DECLARE @FirstDayNextMonth DATETIME = DATEADD(MONTH, 1, @FirstDayMonth);
                        DECLARE @FirstDayLastMonth DATETIME = DATEADD(MONTH, -1, @FirstDayMonth);

                        -- 1. Tabla Temporal de Clientes del Batch
                        CREATE TABLE #BatchClientes (co_cli CHAR(30) COLLATE DATABASE_DEFAULT PRIMARY KEY);
                        
                        INSERT INTO #BatchClientes (co_cli) 
                        VALUES ${values};

                        -- 2. Pre-calcular Facturas (Totales y Fechas)
                        -- Agrupamos por cliente de una sola vez para todo el lote
                        SELECT 
                            f.co_cli,
                            SUM(CASE WHEN f.fec_venc >= @Today AND f.saldo > 0 THEN f.saldo / NULLIF(f.tasa, 0) ELSE 0 END) as total_trancito,
                            SUM(CASE WHEN f.fec_venc < @Today AND f.saldo > 0 THEN f.saldo / NULLIF(f.tasa, 0) ELSE 0 END) as total_vencido,
                            MAX(f.fec_emis) as fecha_ultima_compra,
                            COUNT(DISTINCT CASE WHEN f.fec_emis >= @FirstDayMonth AND f.fec_emis < @FirstDayNextMonth THEN f.fact_num END) as facts_mes_actual,
                            SUM(CASE WHEN f.fec_emis >= @FirstDayMonth AND f.fec_emis < @FirstDayNextMonth THEN f.tot_neto / NULLIF(f.tasa, 0) ELSE 0 END) as ventas_mes_actual,
                            SUM(CASE WHEN f.fec_emis >= @FirstDayLastMonth AND f.fec_emis < @FirstDayMonth THEN f.tot_neto / NULLIF(f.tasa, 0) ELSE 0 END) as ventas_mes_pasado
                        INTO #ResumenFacturas
                        FROM factura f WITH (NOLOCK)
                        INNER JOIN #BatchClientes bc ON f.co_cli = bc.co_cli COLLATE DATABASE_DEFAULT
                        WHERE f.anulada = 0
                        GROUP BY f.co_cli;

                        -- 3. Calcular SKU Mes Actual (requiere join con reng_fac, costoso, hacer solo para facturas del mes)
                        SELECT 
                            f.co_cli,
                            COUNT(DISTINCT rf.co_art) as sku_mes
                        INTO #ResumenSKU
                        FROM factura f WITH (NOLOCK)
                        INNER JOIN reng_fac rf WITH (NOLOCK) ON rf.fact_num = f.fact_num
                        INNER JOIN #BatchClientes bc ON f.co_cli = bc.co_cli COLLATE DATABASE_DEFAULT
                        WHERE f.fec_emis >= @FirstDayMonth 
                        AND f.fec_emis < @FirstDayNextMonth
                        AND f.anulada = 0
                        GROUP BY f.co_cli;

                        -- 4. Morosidad (Factura con mayor saldo)
                        -- Usamos ROW_NUMBER para obtener solo la primera por grupo de manera eficiente
                        SELECT co_cli, nro_doc, fec_emis
                        INTO #Morosidad
                        FROM (
                            SELECT 
                                f.co_cli, f.fact_num AS nro_doc, f.fec_emis,
                                ROW_NUMBER() OVER(PARTITION BY f.co_cli ORDER BY f.fec_venc ASC) as rn
                            FROM factura f WITH (NOLOCK)
                            INNER JOIN #BatchClientes bc ON f.co_cli = bc.co_cli COLLATE DATABASE_DEFAULT
                            WHERE f.saldo > 0 AND f.anulada = 0
                        ) t
                        WHERE rn = 1;

                        -- 5. Último Cobro
                        SELECT co_cli, cob_num, fec_cob
                        INTO #UltimoCobro
                        FROM (
                            SELECT 
                                c.co_cli, c.cob_num, c.fec_cob,
                                ROW_NUMBER() OVER(PARTITION BY c.co_cli ORDER BY c.fec_cob DESC) as rn
                            FROM cobros c WITH (NOLOCK)
                            INNER JOIN #BatchClientes bc ON c.co_cli = bc.co_cli COLLATE DATABASE_DEFAULT
                            WHERE c.anulado = 0
                        ) t
                        WHERE rn = 1;

                        -- 6. Consulta FINAL Unificada
                        SELECT 
                            c.co_cli,
                            c.login,
                            c.horar_caja,
                            ISNULL(rf.total_trancito, 0) as total_trancito,
                            ISNULL(rf.total_vencido, 0) as total_vencido,
                            rf.fecha_ultima_compra,
                            ISNULL(rf.ventas_mes_actual, 0) as ventas_mes_actual,
                            ISNULL(rf.ventas_mes_pasado, 0) as ventas_mes_pasado,
                            ISNULL(sku.sku_mes, 0) as sku_mes,
                            m.nro_doc as morosidad_doc,
                            m.fec_emis as morosidad_fecha,
                            cob.cob_num as ultimo_cobro_num,
                            cob.fec_cob as ultimo_cobro_fecha -- Corregido alias
                        FROM clientes c WITH (NOLOCK)
                        INNER JOIN #BatchClientes bc ON c.co_cli = bc.co_cli COLLATE DATABASE_DEFAULT
                        LEFT JOIN #ResumenFacturas rf ON c.co_cli = rf.co_cli
                        LEFT JOIN #ResumenSKU sku ON c.co_cli = sku.co_cli
                        LEFT JOIN #Morosidad m ON c.co_cli = m.co_cli
                        LEFT JOIN #UltimoCobro cob ON c.co_cli = cob.co_cli
                        ${segmentCondition};

                        -- Limpieza
                        DROP TABLE #BatchClientes;
                        DROP TABLE #ResumenFacturas;
                        DROP TABLE #ResumenSKU;
                        DROP TABLE #Morosidad;
                        DROP TABLE #UltimoCobro;
                    `;

                    return reqPool.query(query);
                };

                // Procesar SQL batches en paralelo (máximo 3 simultáneos para no saturar el pool)
                const CONCURRENCY_LIMIT = 3;
                const allResults = [];

                for (let i = 0; i < batches.length; i += CONCURRENCY_LIMIT) {
                    const batchGroup = batches.slice(i, i + CONCURRENCY_LIMIT);
                    const results = await Promise.all(batchGroup.map(batch => processBatchSQL(batch)));
                    allResults.push(...results);
                }

                // Procesar todos los resultados
                allResults.forEach(result => {
                    result.recordset.forEach(row => {
                        const key = typeof row.co_cli === 'string' ? row.co_cli.trim() : row.co_cli;
                        if (!innerProfitMap[key]) innerProfitMap[key] = {};

                        innerProfitMap[key].login = typeof row.login === 'string' ? row.login.trim() : row.login;
                        innerProfitMap[key].horar_caja = typeof row.horar_caja === 'string' ? row.horar_caja.trim() : row.horar_caja;

                        innerProfitMap[key].saldo_trancito = row.total_trancito;
                        innerProfitMap[key].saldo_vencido = row.total_vencido;
                        innerProfitMap[key].fecha_ultima_compra = row.fecha_ultima_compra
                            ? new Date(row.fecha_ultima_compra).toISOString().split('T')[0]
                            : null;

                        if (row.morosidad_doc) {
                            const nroDoc = typeof row.morosidad_doc === 'string' ? row.morosidad_doc.trim() : row.morosidad_doc;
                            innerProfitMap[key].factura_mayor_morosidad = nroDoc;
                        } else {
                            innerProfitMap[key].factura_mayor_morosidad = null;
                        }

                        innerProfitMap[key].ultimo_cobro = row.ultimo_cobro_fecha
                            ? new Date(row.ultimo_cobro_fecha).toISOString().split('T')[0]
                            : null;

                        innerProfitMap[key].sku_mes = row.sku_mes || 0;
                        innerProfitMap[key].ventas_mes_actual = row.ventas_mes_actual || 0;
                        innerProfitMap[key].ventas_mes_pasado = row.ventas_mes_pasado || 0;
                    });
                });
                console.log(`✅ Datos de Profit obtenidos e integrados.`);
            } catch (dbError) {
                console.error("Error consultando Profit:", dbError);
            }

            return innerProfitMap;
        };

        // 5. Integración con App Database (MySQL) - Gestiones (Ejecutar en PARALELO con Profit)
        const fetchGestiones = async () => {
            const appPool = getAppPool();
            const innerGestionesMap = {};

            if (!appPool || clientCodes.length === 0) return innerGestionesMap;
            try {
                console.log(`📊 Consultando App Database(Gestiones) para ${clientCodes.length} clientes...`);

                const BATCH_SIZE_MYSQL = 1000;
                const mysqlBatches = [];
                for (let i = 0; i < clientCodes.length; i += BATCH_SIZE_MYSQL) {
                    mysqlBatches.push(clientCodes.slice(i, i + BATCH_SIZE_MYSQL));
                }

                for (const batch of mysqlBatches) {
                    const batchPlaceholders = batch.map(() => '?').join(',');
                    const batchQuery = `
                        SELECT
                            co_cli,
                            tipos,
                            venta_tipoGestion,
                            venta_descripcion,
                            cobranza_tipoGestion,
                            cobranza_descripcion,
                            fecha_registro,
                            ubicacion_lat,
                            ubicacion_lng,
                            CASE DAYOFWEEK(CONVERT_TZ(fecha_registro, '+00:00', '-04:00'))
                                WHEN 1 THEN 'Domingo'
                                WHEN 2 THEN 'Lunes'
                                WHEN 3 THEN 'Martes'
                                WHEN 4 THEN 'Miércoles'
                                WHEN 5 THEN 'Jueves'
                                WHEN 6 THEN 'Viernes'
                                WHEN 7 THEN 'Sábado'
                            END as dia_semana
                        FROM gestiones
                        WHERE co_cli IN(${batchPlaceholders})
                          AND YEARWEEK(CONVERT_TZ(fecha_registro, '+00:00', '-04:00'), 1) = YEARWEEK(CURDATE(), 1)
                        ORDER BY fecha_registro DESC
                    `;

                    const [rows] = await appPool.query(batchQuery, batch);
                    rows.forEach(row => {
                        const key = row.co_cli.trim();
                        if (!innerGestionesMap[key]) {
                            innerGestionesMap[key] = [];
                        }
                        innerGestionesMap[key].push({
                            tipos: row.tipos,
                            venta_tipoGestion: row.venta_tipoGestion,
                            venta_descripcion: row.venta_descripcion,
                            cobranza_tipoGestion: row.cobranza_tipoGestion,
                            cobranza_descripcion: row.cobranza_descripcion,
                            fecha_registro: row.fecha_registro,
                            dia_semana: row.dia_semana,
                            ubicacion: row.ubicacion_lat && row.ubicacion_lng ? `${row.ubicacion_lat}, ${row.ubicacion_lng}` : null
                        });
                    });
                }
                console.log(`✅ Datos de App Gestiones obtenidos.`);

            } catch (appError) {
                console.error("Error consultando App Database:", appError);
            }
            return innerGestionesMap;
        };

        // 5.5. Integración con Auditoria (MySQL) - Bitacora
        const fetchAuditoria = async () => {
            const auditoriaPool = getMysqlPool();
            const innerAuditoriaMap = {};
            if (!auditoriaPool || clientCodes.length === 0) return innerAuditoriaMap;
            try {
                const BATCH_SIZE = 1000;
                for (let i = 0; i < clientCodes.length; i += BATCH_SIZE) {
                    const batch = clientCodes.slice(i, i + BATCH_SIZE);
                    const placeholders = batch.map(() => '?').join(',');
                    const query = `SELECT codigo_profit, bitacora FROM registros_auditoria WHERE codigo_profit IN (${placeholders})`;
                    const [rows] = await auditoriaPool.query(query, batch);
                    rows.forEach(row => {
                        if (row.codigo_profit) {
                            innerAuditoriaMap[row.codigo_profit.trim()] = row.bitacora;
                        }
                    });
                }
            } catch (err) {
                console.error("Error consultando Auditoria Bitacora:", err);
            }
            return innerAuditoriaMap;
        };

        // 6. Ejecutar Profit y Gestiones en paralelo si hay códigos de cliente
        let auditoriaMap = {};
        if (clientCodes.length > 0) {
            console.log("⚡ Ejecutando consultas Profit, Gestiones y Auditoria en paralelo...");
            const [pData, gData, aData] = await Promise.all([
                fetchProfit(),
                fetchGestiones(),
                fetchAuditoria()
            ]);
            profitDataMap = pData;
            gestionesMap = gData;
            auditoriaMap = aData;
        }

        // 7. Merge Final (Profit + Bitrix + App)
        const finalData = mappedCompanies.map(bitrixCompany => {
            const clientCode = bitrixCompany.UF_CRM_1634787828;
            const cleanCode = clientCode ? String(clientCode).trim() : null;

            const profitData = cleanCode ? profitDataMap[cleanCode] : null;
            const appData = cleanCode ? gestionesMap[cleanCode] : null;
            const bitacora = cleanCode ? auditoriaMap[cleanCode] : null;

            let profitInfo = null;
            if (profitData) {
                profitInfo = {
                    login: profitData.login || null,
                    saldo_trancito: profitData.saldo_trancito || 0,
                    saldo_vencido: profitData.saldo_vencido || 0,
                    fecha_ultima_compra: profitData.fecha_ultima_compra || null,
                    factura_mayor_morosidad: profitData.factura_mayor_morosidad || null,
                    ultimo_cobro: profitData.ultimo_cobro || null,
                    sku_mes: profitData.sku_mes || 0,
                    horar_caja: profitData.horar_caja || "",
                    ventas_mes_actual: profitData.ventas_mes_actual || 0,
                    ventas_mes_pasado: profitData.ventas_mes_pasado || 0
                };
            }

            const gestionInfo = appData ? appData.map(gestion => ({
                tipos: gestion.tipos ? JSON.parse(gestion.tipos) : [],
                venta_tipoGestion: gestion.venta_tipoGestion,
                venta_descripcion: gestion.venta_descripcion,
                cobranza_tipoGestion: gestion.cobranza_tipoGestion,
                cobranza_descripcion: gestion.cobranza_descripcion,
                fecha_registro: gestion.fecha_registro
                    ? new Date(gestion.fecha_registro).toISOString().replace('T', ' ').substring(0, 19)
                    : null,
                dia_semana: gestion.dia_semana || null,
                ubicacion: gestion.ubicacion || null
            })) : [];

            return {
                bitrix: bitrixCompany,
                profit: profitInfo,
                gestion: gestionInfo,
                bitacora: bitacora || null
            };
        });

        const totalTime = (Date.now() - startTime) / 1000;
        console.log(`🏁 Proceso finalizado en ${totalTime} s`);

        // 8. Filtrar por segmento si se solicitó (Eliminar los que no trajeron data de Profit)
        let responseData = finalData;
        if (segmentos && Array.isArray(segmentos) && segmentos.length > 0) {
            responseData = finalData.filter(item => item.profit !== null);
        }

        res.json({
            success: true,
            total: responseData.length,
            time_seconds: totalTime,
            data: responseData
        });

    } catch (error) {
        console.error("Error en getAllBitrixCompanies:", error);
        res.status(500).json({
            error: "Error al obtener todas las compañías",
            details: error.message
        });
    }
};
