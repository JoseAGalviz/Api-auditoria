import fetch from "node-fetch";
import { sql, getAppPool, getMysqlPool } from "../config/database.js";

/**
 * Obtener lista de compañías desde Bitrix24 (PAGINADA)
 * @route GET /api/clientes/companies
 */
export const getBitrixCompanies = async (req, res) => {
  try {
    const BITRIX_URL =
      "https://b24-sjdauj.bitrix24.es/rest/5149/qly93wxo8xvetemt/crm.company.list.json";
    const BITRIX_FIELDS_URL =
      "https://b24-sjdauj.bitrix24.es/rest/5149/qly93wxo8xvetemt/crm.company.fields.json";

    const targetFields = [
      "UF_CRM_1634787828",
      "UF_CRM_1635903069",
      "UF_CRM_1638457710",
      "UF_CRM_1651251237102",
      "UF_CRM_1686015739936",
    ];

    const fieldsToSelect = ["ID", "TITLE", ...targetFields];
    const { start } = req.query;

    const [companiesResponse, fieldsResponse] = await Promise.all([
      fetch(BITRIX_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          select: fieldsToSelect,
          filter: { "!UF_CRM_1638457710": ["921", "3135"] },
          start: start ? parseInt(start) : 0,
        }),
      }),
      fetch(BITRIX_FIELDS_URL),
    ]);

    const [companiesData, fieldsDefinitions] = await Promise.all([
      companiesResponse.json(),
      fieldsResponse.json(),
    ]);

    if (!companiesData.result || !fieldsDefinitions.result) {
      throw new Error("Error al obtener datos de Bitrix24");
    }

    const fieldMaps = {};
    targetFields.forEach((fieldName) => {
      if (fieldsDefinitions.result[fieldName]?.items) {
        const map = {};
        fieldsDefinitions.result[fieldName].items.forEach(
          (item) => (map[item.ID] = item.VALUE),
        );
        fieldMaps[fieldName] = map;
      } else if (fieldsDefinitions.result[fieldName]?.LIST) {
        const map = {};
        fieldsDefinitions.result[fieldName].LIST.forEach(
          (item) => (map[item.ID] = item.VALUE),
        );
        fieldMaps[fieldName] = map;
      }
    });

    const mappedCompanies = companiesData.result.map((company) => {
      const newCompany = { ...company };
      targetFields.forEach((field) => {
        if (newCompany[field] && fieldMaps[field]) {
          const rawValue = newCompany[field];
          if (Array.isArray(rawValue)) {
            newCompany[field] = rawValue.map(
              (id) => fieldMaps[field][id] || id,
            );
          } else {
            newCompany[field] = fieldMaps[field][rawValue] || rawValue;
          }
        } else if (typeof newCompany[field] === "string") {
          newCompany[field] = newCompany[field].trim();
        }
      });
      if (newCompany.TITLE) newCompany.TITLE = newCompany.TITLE.trim();
      return newCompany;
    });

    const uniqueCodesMap = new Map();
    mappedCompanies.forEach((c) => {
      const rawCode = c.UF_CRM_1634787828;
      if (rawCode) {
        const cleanCode = String(rawCode).trim().toUpperCase();
        if (!uniqueCodesMap.has(cleanCode))
          uniqueCodesMap.set(cleanCode, String(rawCode).trim());
      }
    });
    const clientCodes = Array.from(uniqueCodesMap.values());

    let profitDataMap = {};
    let gestionesMap = {};
    let auditoriaMap = {};
    let matrixMap = {}; // Nueva variable para datos de la matriz

    // 1. Profit
    if (clientCodes.length > 0) {
      try {
        const pool = await sql.connect();
        const reqPool = pool.request();
        const paramNames = clientCodes.map((_, index) => `code${index}`);
        clientCodes.forEach((code, index) =>
          reqPool.input(`code${index}`, code),
        );

        const query = `
            DECLARE @Today DATETIME = GETDATE();
            DECLARE @FirstDayMonth DATETIME = DATEFROMPARTS(YEAR(@Today), MONTH(@Today), 1);
            DECLARE @FirstDayNextMonth DATETIME = DATEADD(MONTH, 1, @FirstDayMonth);
            DECLARE @FirstDayLastMonth DATETIME = DATEADD(MONTH, -1, @FirstDayMonth);
            
            SELECT co_cli, login, horar_caja FROM clientes WITH (NOLOCK) WHERE co_cli IN (${paramNames.map((p) => `@${p}`).join(",")});
            
            SELECT c.co_cli, ISNULL(f.total_trancito, 0) AS total_trancito, ISNULL(f.total_vencido, 0) AS total_vencido, f.fecha_ultima_compra, m.nro_doc, m.factura_mayor_morosidad, cob.cob_num, cob.ultimo_cobro, ISNULL(sku.sku_mes, 0) AS sku_mes, ISNULL(vm_actual.ventas_mes_actual, 0) AS ventas_mes_actual, ISNULL(vm_pasado.ventas_mes_pasado, 0) AS ventas_mes_pasado
            FROM (SELECT DISTINCT co_cli FROM clientes WHERE co_cli IN (${paramNames.map((p) => `@${p}`).join(",")})) c
            OUTER APPLY (SELECT ROUND(SUM(CASE WHEN fec_venc >= @Today AND saldo > 0 THEN saldo / NULLIF(tasa, 0) ELSE 0 END), 2) AS total_trancito, ROUND(SUM(CASE WHEN fec_venc < @Today AND saldo > 0 THEN saldo / NULLIF(tasa, 0) ELSE 0 END), 2) AS total_vencido, MAX(fec_emis) AS fecha_ultima_compra FROM factura WITH (NOLOCK) WHERE co_cli = c.co_cli AND anulada = 0) f
            OUTER APPLY (SELECT TOP 1 fact_num AS nro_doc, fec_emis AS factura_mayor_morosidad FROM factura WITH (NOLOCK) WHERE co_cli = c.co_cli AND saldo > 0 AND anulada = 0 ORDER BY fec_venc ASC) m
            OUTER APPLY (SELECT TOP 1 cob_num, fec_cob AS ultimo_cobro FROM cobros WITH (NOLOCK) WHERE co_cli = c.co_cli AND anulado = 0 ORDER BY fec_cob DESC) cob
            OUTER APPLY (SELECT COUNT(DISTINCT rf.co_art) AS sku_mes FROM factura f WITH (NOLOCK) INNER JOIN reng_fac rf WITH (NOLOCK) ON rf.fact_num = f.fact_num WHERE f.co_cli = c.co_cli AND f.anulada = 0 AND f.fec_emis >= @FirstDayMonth AND f.fec_emis < @FirstDayNextMonth) sku
            OUTER APPLY (SELECT ROUND(SUM(tot_neto / NULLIF(tasa, 0)), 2) AS ventas_mes_actual FROM factura WITH (NOLOCK) WHERE co_cli = c.co_cli AND anulada = 0 AND fec_emis >= @FirstDayMonth AND fec_emis < @FirstDayNextMonth) vm_actual
            OUTER APPLY (SELECT ROUND(SUM(tot_neto / NULLIF(tasa, 0)), 2) AS ventas_mes_pasado FROM factura WITH (NOLOCK) WHERE co_cli = c.co_cli AND anulada = 0 AND fec_emis >= @FirstDayLastMonth AND fec_emis < @FirstDayMonth) vm_pasado;
        `;

        const result = await reqPool.query(query);
        result.recordsets[0].forEach((row) => {
          const key = row.co_cli.trim();
          if (!profitDataMap[key]) profitDataMap[key] = {};
          profitDataMap[key].login = row.login?.trim();
          profitDataMap[key].horar_caja = row.horar_caja?.trim();
        });
        if (result.recordsets.length > 1) {
          result.recordsets[1].forEach((row) => {
            const key = row.co_cli.trim();
            if (!profitDataMap[key]) profitDataMap[key] = {};
            const nroDoc = row.nro_doc ? String(row.nro_doc).trim() : null;
            Object.assign(profitDataMap[key], {
              saldo_trancito: row.total_trancito,
              saldo_vencido: row.total_vencido,
              fecha_ultima_compra: row.fecha_ultima_compra
                ? new Date(row.fecha_ultima_compra).toISOString().split("T")[0]
                : null,
              factura_mayor_morosidad: nroDoc,
              ultimo_cobro: row.ultimo_cobro
                ? new Date(row.ultimo_cobro).toISOString().split("T")[0]
                : null,
              sku_mes: row.sku_mes,
              ventas_mes_actual: row.ventas_mes_actual,
              ventas_mes_pasado: row.ventas_mes_pasado,
            });
          });
        }
      } catch (dbError) {
        console.error("Error Profit:", dbError);
      }
    }

    // 2. Auditoria (Old) & Matrix (New)
    const appPool = getAppPool(); // Usamos AppPool para la tabla matrix
    const auditoriaPool = getMysqlPool(); // Usamos MysqlPool para registros_auditoria vieja

    if (clientCodes.length > 0) {
      const placeholders = clientCodes.map(() => "?").join(",");

      // A. Fetch Old Auditoria
      if (auditoriaPool) {
        try {
          const query = `SELECT codigo_profit, bitacora, obs_ejecutiva, plan_semana FROM registros_auditoria WHERE codigo_profit IN (${placeholders})`;
          const [rows] = await auditoriaPool.query(query, clientCodes);
          rows.forEach((row) => {
            if (row.codigo_profit) {
              let parsedPlan = {};
              try {
                parsedPlan =
                  typeof row.plan_semana === "string"
                    ? JSON.parse(row.plan_semana)
                    : row.plan_semana || {};
              } catch (e) { }
              auditoriaMap[row.codigo_profit.trim()] = {
                bitacora: row.bitacora,
                obs_ejecutiva: row.obs_ejecutiva,
                plan_semana: parsedPlan,
              };
            }
          });
        } catch (err) {
          console.error("Error Auditoria DB:", err);
        }
      }

      // B. Fetch Matrix (NUEVO)
      if (appPool) {
        try {
          const query = `SELECT codigo_profit, auditoria_matriz FROM matrix WHERE codigo_profit IN (${placeholders})`;
          const [rows] = await appPool.query(query, clientCodes);
          rows.forEach((row) => {
            if (row.codigo_profit) {
              let parsed = null;
              try {
                parsed =
                  typeof row.auditoria_matriz === "string"
                    ? JSON.parse(row.auditoria_matriz)
                    : row.auditoria_matriz;
              } catch (e) { }
              matrixMap[row.codigo_profit.trim()] = parsed;
            }
          });
        } catch (err) {
          console.error("Error Matrix DB:", err);
        }
      }

      // C. Fetch Gestiones
      if (appPool) {
        try {
          const query = `
            SELECT co_cli, tipos, venta_tipoGestion, venta_descripcion, cobranza_tipoGestion, cobranza_descripcion, fecha_registro, ubicacion_lat, ubicacion_lng,
            CASE DAYOFWEEK(CONVERT_TZ(fecha_registro, '+00:00', '-04:00')) WHEN 1 THEN 'Domingo' WHEN 2 THEN 'Lunes' WHEN 3 THEN 'Martes' WHEN 4 THEN 'Miércoles' WHEN 5 THEN 'Jueves' WHEN 6 THEN 'Viernes' WHEN 7 THEN 'Sábado' END as dia_semana
            FROM gestiones WHERE co_cli IN (${placeholders}) AND YEARWEEK(CONVERT_TZ(fecha_registro, '+00:00', '-04:00'), 1) = YEARWEEK(CURDATE(), 1) ORDER BY fecha_registro DESC
          `;
          const [rows] = await appPool.query(query, clientCodes);
          rows.forEach((row) => {
            const key = row.co_cli.trim();
            if (!gestionesMap[key]) gestionesMap[key] = [];
            gestionesMap[key].push({
              tipos: row.tipos,
              venta_tipoGestion: row.venta_tipoGestion,
              venta_descripcion: row.venta_descripcion,
              cobranza_tipoGestion: row.cobranza_tipoGestion,
              cobranza_descripcion: row.cobranza_descripcion,
              fecha_registro: row.fecha_registro,
              dia_semana: row.dia_semana,
              ubicacion:
                row.ubicacion_lat && row.ubicacion_lng
                  ? `${row.ubicacion_lat}, ${row.ubicacion_lng}`
                  : null,
            });
          });
        } catch (err) {
          console.error("Error App DB:", err);
        }
      }
    }

    // Merge Final
    const finalData = mappedCompanies.map((bitrixCompany) => {
      const clientCode = bitrixCompany.UF_CRM_1634787828;
      const cleanCode = clientCode ? String(clientCode).trim() : null;

      const profitData = cleanCode ? profitDataMap[cleanCode] : null;
      const appData = cleanCode ? gestionesMap[cleanCode] : null;
      const auditoriaData =
        cleanCode && auditoriaMap[cleanCode] ? auditoriaMap[cleanCode] : {};
      const matrixData =
        cleanCode && matrixMap[cleanCode] ? matrixMap[cleanCode] : null; // Datos guardados

      let profitInfo = null;
      if (profitData) {
        profitInfo = { ...profitData };
      }

      const gestionInfo = appData
        ? appData.map((g) => ({
          ...g,
          tipos: g.tipos ? JSON.parse(g.tipos) : [],
          fecha_registro: g.fecha_registro
            ? new Date(g.fecha_registro)
              .toISOString()
              .replace("T", " ")
              .substring(0, 19)
            : null,
          ubicacion: g.ubicacion || null,
        }))
        : [];

      return {
        bitrix: bitrixCompany,
        profit: profitInfo,
        gestion: gestionInfo,
        bitacora: auditoriaData.bitacora || null,
        obs_ejecutiva: auditoriaData.obs_ejecutiva || null,
        semana: auditoriaData.plan_semana || {},
        auditoria_guardada: matrixData, // ENVÍO AL FRONT
      };
    });

    res.json({
      success: true,
      total: companiesData.total,
      next: companiesData.next,
      data: finalData,
    });
  } catch (error) {
    console.error("Error en getBitrixCompanies:", error);
    res.status(500).json({ error: "Error interno", details: error.message });
  }
};

/**
 * Obtener TODAS las compañías desde Bitrix24 (Optimizado con Batch)
 * @route GET /api/clientes/companies/all
 */
export const getAllBitrixCompanies = async (req, res) => {
  try {
    const { segmentos } = req.body || {};

    const BITRIX_BATCH_URL =
      "https://cristmedical.bitrix24.es/rest/5149/qly93wxo8xvetemt/batch.json";
    const BITRIX_FIELDS_URL =
      "https://cristmedical.bitrix24.es/rest/5149/b4eirrr8ila4cpzk/crm.company.fields.json";
    const BITRIX_LIST_URL =
      "https://cristmedical.bitrix24.es/rest/5149/qly93wxo8xvetemt/crm.company.list.json";

    const targetFields = [
      "UF_CRM_1634787828",
      "UF_CRM_1635903069",
      "UF_CRM_1638457710",
      "UF_CRM_1651251237102",
      "UF_CRM_1686015739936",
    ];

    // Construir filtro base de Bitrix
    let BITRIX_FILTER = { "!UF_CRM_1638457710": ["921", "3135"] };
    const fieldsToSelect = ["ID", "TITLE", ...targetFields];

    console.log("🚀 Iniciando consulta OPTIMIZADA (BatchStrategy)...");
    const startTime = Date.now();

    // Primero obtenemos las definiciones de campos para mapear los segmentos
    const fieldsResponse = await fetch(BITRIX_FIELDS_URL);
    const fieldsDefinitions = await fieldsResponse.json();

    if (!fieldsDefinitions.result)
      throw new Error("Error Bitrix Metadata");

    const fieldMaps = {};
    targetFields.forEach((fieldName) => {
      if (fieldsDefinitions.result[fieldName]?.items) {
        const map = {};
        fieldsDefinitions.result[fieldName].items.forEach(
          (i) => (map[i.ID] = i.VALUE),
        );
        fieldMaps[fieldName] = map;
      } else if (fieldsDefinitions.result[fieldName]?.LIST) {
        const map = {};
        fieldsDefinitions.result[fieldName].LIST.forEach(
          (i) => (map[i.ID] = i.VALUE),
        );
        fieldMaps[fieldName] = map;
      }
    });

    // Si hay segmentos, construir filtro específico para UF_CRM_1638457710
    if (segmentos && Array.isArray(segmentos) && segmentos.length > 0) {
      console.log(`🔍 Filtrando por segmentos: ${JSON.stringify(segmentos)}`);

      const segmentFieldMap = fieldMaps["UF_CRM_1638457710"];
      if (segmentFieldMap) {
        // Encontrar los IDs que corresponden a los segmentos solicitados
        const segmentIds = [];
        const normalizedSegments = segmentos.map(s => String(s).trim().toLowerCase());

        for (const [id, value] of Object.entries(segmentFieldMap)) {
          const normalizedValue = String(value).trim().toLowerCase();
          if (normalizedSegments.includes(normalizedValue)) {
            segmentIds.push(id);
          }
        }

        if (segmentIds.length > 0) {
          console.log(`📋 IDs de segmentos encontrados: ${segmentIds.join(", ")}`);
          // Agregar filtro positivo para los segmentos solicitados
          BITRIX_FILTER["UF_CRM_1638457710"] = segmentIds;
          console.log("⚠️ No se encontraron IDs para los segmentos proporcionados");
        }
      } else {
        console.log("⚠️ No se encontró el fieldMap para UF_CRM_1638457710");
      }
    }

    // Ahora obtenemos el conteo con el filtro aplicado
    const countResponse = await fetch(BITRIX_LIST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        select: ["ID"],
        filter: BITRIX_FILTER,
        start: 0,
      }),
    });

    const countData = await countResponse.json();

    if (!countData.result)
      throw new Error("Error Bitrix Count");

    const totalRecords = countData.total;
    console.log(`📊 Total registros a consultar: ${totalRecords}`);

    const RECORDS_PER_CMD = 50;
    const CMDS_PER_BATCH = 50;
    const RECORDS_PER_BATCH = RECORDS_PER_CMD * CMDS_PER_BATCH;
    const totalBatches = Math.ceil(totalRecords / RECORDS_PER_BATCH);
    let allCompanies = [];

    const fetchBatch = async (batchIndex) => {
      const batchCommands = {};
      const startOffset = batchIndex * RECORDS_PER_BATCH;
      for (let i = 0; i < CMDS_PER_BATCH; i++) {
        const cmdStart = startOffset + i * RECORDS_PER_CMD;
        if (cmdStart >= totalRecords) break;

        // Construir parámetros de select
        const selectParams = fieldsToSelect
          .map((f) => `select[]=${f}`)
          .join("&");

        // Construir parámetros de filtro dinámicamente
        let filterParams = "";
        for (const [key, value] of Object.entries(BITRIX_FILTER)) {
          if (Array.isArray(value)) {
            filterParams += value.map((val) => `filter[${key}][]=${val}`).join("&") + "&";
          } else {
            filterParams += `filter[${key}]=${value}&`;
          }
        }
        filterParams = filterParams.slice(0, -1); // Remover último &

        batchCommands[`cmd_${i}`] =
          `crm.company.list?start=${cmdStart}&${selectParams}&${filterParams}`;
      }
      if (Object.keys(batchCommands).length === 0) return [];

      const response = await fetch(BITRIX_BATCH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ halt: 0, cmd: batchCommands }),
      });
      const data = await response.json();

      if (data.error) {
        console.error(`❌ Error en Batch ${batchIndex}:`, data.error_description);
      }
      const batchResult = data.result?.result
        ? Object.values(data.result.result).flat()
        : [];

      console.log(`📥 Batch ${batchIndex}: Recibidos ${batchResult.length} registros.`);
      return batchResult;
    };

    const batchPromises = [];
    for (let i = 0; i < totalBatches; i++) batchPromises.push(fetchBatch(i));

    const results = await Promise.all(batchPromises);
    results.forEach((res) => (allCompanies = allCompanies.concat(res)));

    console.log(`✅ Total compañías descargadas de Bitrix: ${allCompanies.length}`);

    const mappedCompanies = allCompanies.map((company) => {
      const newCompany = { ...company };
      targetFields.forEach((field) => {
        if (newCompany[field] && fieldMaps[field]) {
          const raw = newCompany[field];
          if (Array.isArray(raw)) {
            newCompany[field] = raw.map((id) => fieldMaps[field][id] || id);
          } else {
            newCompany[field] = fieldMaps[field][raw] || raw;
          }
        } else if (typeof newCompany[field] === "string") {
          newCompany[field] = newCompany[field].trim();
        }
      });
      if (newCompany.TITLE) newCompany.TITLE = newCompany.TITLE.trim();
      return newCompany;
    });

    // Extraer códigos profit de las compañías (ya filtradas por Bitrix)
    const uniqueCodesMap = new Map();
    mappedCompanies.forEach((c) => {
      const raw = c.UF_CRM_1634787828;
      if (raw)
        uniqueCodesMap.set(
          String(raw).trim().toUpperCase(),
          String(raw).trim(),
        );
    });
    const clientCodes = Array.from(uniqueCodesMap.values());
    console.log(`📋 Códigos profit a buscar: ${clientCodes.length}`);

    let profitDataMap = {};
    let gestionesMap = {};
    let auditoriaMap = {};
    let matrixMap = {}; // Datos de la matriz guardada

    // 5.1 Profit Batch
    const fetchProfit = async () => {
      const innerProfitMap = {};
      if (clientCodes.length === 0) return innerProfitMap;
      try {
        const pool = await sql.connect();
        const BATCH_SIZE = 900;
        const batches = [];
        for (let i = 0; i < clientCodes.length; i += BATCH_SIZE)
          batches.push(clientCodes.slice(i, i + BATCH_SIZE));

        const processBatchSQL = async (batch) => {
          const localPool = await sql.connect();
          const reqPool = localPool.request();
          const values = batch.map((c) => `('${c}')`).join(",");

          const query = `
                        SET NOCOUNT ON;
                        DECLARE @Today DATETIME = GETDATE();
                        DECLARE @FirstDayMonth DATETIME = DATEFROMPARTS(YEAR(@Today), MONTH(@Today), 1);
                        DECLARE @FirstDayNextMonth DATETIME = DATEADD(MONTH, 1, @FirstDayMonth);
                        DECLARE @FirstDayLastMonth DATETIME = DATEADD(MONTH, -1, @FirstDayMonth);

                        CREATE TABLE #BatchClientes (co_cli CHAR(30) COLLATE DATABASE_DEFAULT PRIMARY KEY);
                        INSERT INTO #BatchClientes (co_cli) VALUES ${values};

                        SELECT 
                            f.co_cli,
                            SUM(CASE WHEN f.fec_venc >= @Today AND f.saldo > 0 THEN f.saldo / NULLIF(f.tasa, 0) ELSE 0 END) as total_trancito,
                            SUM(CASE WHEN f.fec_venc < @Today AND f.saldo > 0 THEN f.saldo / NULLIF(f.tasa, 0) ELSE 0 END) as total_vencido,
                            MAX(f.fec_emis) as fecha_ultima_compra,
                            SUM(CASE WHEN f.fec_emis >= @FirstDayMonth AND f.fec_emis < @FirstDayNextMonth THEN f.tot_neto / NULLIF(f.tasa, 0) ELSE 0 END) as ventas_mes_actual,
                            SUM(CASE WHEN f.fec_emis >= @FirstDayLastMonth AND f.fec_emis < @FirstDayMonth THEN f.tot_neto / NULLIF(f.tasa, 0) ELSE 0 END) as ventas_mes_pasado
                        INTO #ResumenFacturas FROM factura f WITH (NOLOCK) INNER JOIN #BatchClientes bc ON f.co_cli = bc.co_cli COLLATE DATABASE_DEFAULT WHERE f.anulada = 0 GROUP BY f.co_cli;

                        SELECT f.co_cli, COUNT(DISTINCT rf.co_art) as sku_mes INTO #ResumenSKU FROM factura f WITH (NOLOCK) INNER JOIN reng_fac rf WITH (NOLOCK) ON rf.fact_num = f.fact_num INNER JOIN #BatchClientes bc ON f.co_cli = bc.co_cli COLLATE DATABASE_DEFAULT WHERE f.fec_emis >= @FirstDayMonth AND f.fec_emis < @FirstDayNextMonth AND f.anulada = 0 GROUP BY f.co_cli;

                        SELECT co_cli, nro_doc, fec_emis INTO #Morosidad FROM (SELECT f.co_cli, f.fact_num AS nro_doc, f.fec_emis, ROW_NUMBER() OVER(PARTITION BY f.co_cli ORDER BY f.fec_venc ASC) as rn FROM factura f WITH (NOLOCK) INNER JOIN #BatchClientes bc ON f.co_cli = bc.co_cli COLLATE DATABASE_DEFAULT WHERE f.saldo > 0 AND f.anulada = 0) t WHERE rn = 1;

                        SELECT co_cli, cob_num, fec_cob INTO #UltimoCobro FROM (SELECT c.co_cli, c.cob_num, c.fec_cob, ROW_NUMBER() OVER(PARTITION BY c.co_cli ORDER BY c.fec_cob DESC) as rn FROM cobros c WITH (NOLOCK) INNER JOIN #BatchClientes bc ON c.co_cli = bc.co_cli COLLATE DATABASE_DEFAULT WHERE c.anulado = 0) t WHERE rn = 1;

                        SELECT c.co_cli, c.login, c.horar_caja, ISNULL(rf.total_trancito, 0) as total_trancito, ISNULL(rf.total_vencido, 0) as total_vencido, rf.fecha_ultima_compra, ISNULL(rf.ventas_mes_actual, 0) as ventas_mes_actual, ISNULL(rf.ventas_mes_pasado, 0) as ventas_mes_pasado, ISNULL(sku.sku_mes, 0) as sku_mes, m.nro_doc as morosidad_doc, cob.cob_num as ultimo_cobro_num, cob.fec_cob as ultimo_cobro_fecha
                        FROM clientes c WITH (NOLOCK) 
                        INNER JOIN #BatchClientes bc ON c.co_cli = bc.co_cli COLLATE DATABASE_DEFAULT 
                        LEFT JOIN #ResumenFacturas rf ON c.co_cli = rf.co_cli 
                        LEFT JOIN #ResumenSKU sku ON c.co_cli = sku.co_cli 
                        LEFT JOIN #Morosidad m ON c.co_cli = m.co_cli 
                        LEFT JOIN #UltimoCobro cob ON c.co_cli = cob.co_cli;

                        DROP TABLE #BatchClientes; DROP TABLE #ResumenFacturas; DROP TABLE #ResumenSKU; DROP TABLE #Morosidad; DROP TABLE #UltimoCobro;
                    `;
          return reqPool.query(query);
        };

        const CONCURRENCY_LIMIT = 3;
        const allResults = [];
        for (let i = 0; i < batches.length; i += CONCURRENCY_LIMIT) {
          const batchGroup = batches.slice(i, i + CONCURRENCY_LIMIT);
          const results = await Promise.all(
            batchGroup.map((b) => processBatchSQL(b)),
          );
          allResults.push(...results);
        }

        allResults.forEach((res) => {
          res.recordset.forEach((row) => {
            const key = row.co_cli.trim();
            if (!innerProfitMap[key]) innerProfitMap[key] = {};
            const nroDoc = row.morosidad_doc
              ? String(row.morosidad_doc).trim()
              : null;
            innerProfitMap[key] = {
              login: row.login?.trim(),
              horar_caja: row.horar_caja?.trim(),
              saldo_trancito: row.total_trancito,
              saldo_vencido: row.total_vencido,
              fecha_ultima_compra: row.fecha_ultima_compra
                ? new Date(row.fecha_ultima_compra).toISOString().split("T")[0]
                : null,
              factura_mayor_morosidad: nroDoc,
              ultimo_cobro: row.ultimo_cobro_fecha
                ? new Date(row.ultimo_cobro_fecha).toISOString().split("T")[0]
                : null,
              sku_mes: row.sku_mes || 0,
              ventas_mes_actual: row.ventas_mes_actual || 0,
              ventas_mes_pasado: row.ventas_mes_pasado || 0,
            };
          });
        });
      } catch (e) {
        console.error("Error Profit:", e);
      }
      return innerProfitMap;
    };

    // 5.2 Gestiones Batch (CON COORDENADAS)
    const fetchGestiones = async () => {
      const appPool = getAppPool();
      const innerGestionesMap = {};
      if (!appPool || clientCodes.length === 0) return innerGestionesMap;
      try {
        const BATCH_SIZE = 1000;
        const batches = [];
        for (let i = 0; i < clientCodes.length; i += BATCH_SIZE)
          batches.push(clientCodes.slice(i, i + BATCH_SIZE));
        for (const batch of batches) {
          const placeholders = batch.map(() => "?").join(",");
          const query = `
                        SELECT co_cli, tipos, venta_tipoGestion, venta_descripcion, cobranza_tipoGestion, cobranza_descripcion, fecha_registro, ubicacion_lat, ubicacion_lng,
                        CASE DAYOFWEEK(CONVERT_TZ(fecha_registro, '+00:00', '-04:00')) WHEN 1 THEN 'Domingo' WHEN 2 THEN 'Lunes' WHEN 3 THEN 'Martes' WHEN 4 THEN 'Miércoles' WHEN 5 THEN 'Jueves' WHEN 6 THEN 'Viernes' WHEN 7 THEN 'Sábado' END as dia_semana
                        FROM gestiones WHERE co_cli IN(${placeholders}) AND YEARWEEK(CONVERT_TZ(fecha_registro, '+00:00', '-04:00'), 1) = YEARWEEK(CURDATE(), 1) ORDER BY fecha_registro DESC
                    `;
          const [rows] = await appPool.query(query, batch);
          rows.forEach((r) => {
            const key = r.co_cli.trim();
            if (!innerGestionesMap[key]) innerGestionesMap[key] = [];
            innerGestionesMap[key].push({
              ...r,
              ubicacion:
                r.ubicacion_lat && r.ubicacion_lng
                  ? `${r.ubicacion_lat}, ${r.ubicacion_lng}`
                  : null,
            });
          });
        }
      } catch (e) {
        console.error("Error App DB:", e);
      }
      return innerGestionesMap;
    };

    // 5.3 Auditoria Batch
    const fetchAuditoria = async () => {
      const auditoriaPool = getMysqlPool();
      const innerAuditoriaMap = {};
      if (!auditoriaPool || clientCodes.length === 0) return innerAuditoriaMap;
      try {
        const BATCH_SIZE = 1000;
        for (let i = 0; i < clientCodes.length; i += BATCH_SIZE) {
          const batch = clientCodes.slice(i, i + BATCH_SIZE);
          const placeholders = batch.map(() => "?").join(",");
          const query = `SELECT codigo_profit, bitacora, obs_ejecutiva, plan_semana FROM registros_auditoria WHERE codigo_profit IN (${placeholders})`;
          const [rows] = await auditoriaPool.query(query, batch);
          rows.forEach((r) => {
            if (r.codigo_profit) {
              let parsed = {};
              try {
                parsed =
                  typeof r.plan_semana === "string"
                    ? JSON.parse(r.plan_semana)
                    : r.plan_semana || {};
              } catch (e) { }
              innerAuditoriaMap[r.codigo_profit.trim()] = {
                bitacora: r.bitacora,
                obs_ejecutiva: r.obs_ejecutiva,
                plan_semana: parsed,
              };
            }
          });
        }
      } catch (e) {
        console.error("Error Auditoria DB:", e);
      }
      return innerAuditoriaMap;
    };

    // 5.4. Matrix Batch (NUEVO: Recuperar datos guardados)
    // NOTA: Temporalmente deshabilitado - la tabla 'matrix' no existe
    const fetchMatrixData = async () => {
      const innerMatrixMap = {};
      return innerMatrixMap;

      /* CÓDIGO ORIGINAL - DESCOMENTAR CUANDO SE CREE LA TABLA 'matrix'
      const appPool = getAppPool();
      if (!appPool || clientCodes.length === 0) return innerMatrixMap;
      try {
        const BATCH_SIZE = 1000;
        for (let i = 0; i < clientCodes.length; i += BATCH_SIZE) {
          const batch = clientCodes.slice(i, i + BATCH_SIZE);
          const placeholders = batch.map(() => "?").join(",");
          const query = `SELECT codigo_profit, auditoria_matriz FROM matrix WHERE codigo_profit IN (${placeholders})`;
          const [rows] = await appPool.query(query, batch);
          rows.forEach((r) => {
            if (r.codigo_profit) {
              let parsed = null;
              try {
                parsed =
                  typeof r.auditoria_matriz === "string"
                    ? JSON.parse(r.auditoria_matriz)
                    : r.auditoria_matriz;
              } catch (e) {
                console.error("Error parsing matrix json", e);
              }
              innerMatrixMap[r.codigo_profit.trim()] = parsed;
            }
          });
        }
      } catch (e) {
        console.error("Error Matrix DB:", e);
      }
      */
      return innerMatrixMap;
    };

    if (clientCodes.length > 0) {
      console.log("⚡ Ejecutando consultas externas en paralelo...");
      const [pData, gData, aData, mData] = await Promise.all([
        fetchProfit(),
        fetchGestiones(),
        fetchAuditoria(),
        fetchMatrixData(), // <--- Agregado
      ]);
      profitDataMap = pData;
      gestionesMap = gData;
      auditoriaMap = aData;
      matrixMap = mData; // <--- Agregado
    }

    // 7. Merge Final
    const finalData = mappedCompanies.map((c) => {
      const clientCode = c.UF_CRM_1634787828;
      const cleanCode = clientCode ? String(clientCode).trim() : null;

      const profitData = cleanCode ? profitDataMap[cleanCode] : null;
      const appData = cleanCode ? gestionesMap[cleanCode] : null;
      const auditoriaData =
        cleanCode && auditoriaMap[cleanCode] ? auditoriaMap[cleanCode] : {};
      const matrixData =
        cleanCode && matrixMap[cleanCode] ? matrixMap[cleanCode] : null; // <--- Agregado

      let profitInfo = null;
      if (profitData) profitInfo = { ...profitData };

      const gestionInfo = appData
        ? appData.map((g) => ({
          ...g,
          tipos: g.tipos ? JSON.parse(g.tipos) : [],
          fecha_registro: g.fecha_registro
            ? new Date(g.fecha_registro)
              .toISOString()
              .replace("T", " ")
              .substring(0, 19)
            : null,
          ubicacion: g.ubicacion || null,
        }))
        : [];

      return {
        bitrix: c,
        profit: profitInfo,
        gestion: gestionInfo,
        bitacora: auditoriaData.bitacora || null,
        obs_ejecutiva: auditoriaData.obs_ejecutiva || null,
        semana: auditoriaData.plan_semana || {},
        auditoria_guardada: matrixData, // <--- Enviamos datos al front
      };
    });

    const totalTime = (Date.now() - startTime) / 1000;
    console.log(`🏁 Proceso finalizado en ${totalTime} s`);
    console.log(`� Total resultados finales: ${finalData.length}`);

    res.json({
      success: true,
      total: finalData.length,
      time_seconds: totalTime,
      data: finalData,
    });
  } catch (error) {
    console.error("Error en getAllBitrixCompanies:", error);
    res.status(500).json({ error: "Error interno", details: error.message });
  }
};

/**
 * Guardar o Actualizar datos de la matriz
 * @route POST /api/matrix
 */
export const saveMatrixData = async (req, res) => {
  try {
    const pool = getAppPool();
    if (!pool) {
      throw new Error("No hay conexión a la base de datos de App");
    }

    const { id_bitrix, codigo_profit, gestion, full_data } = req.body;

    if (!codigo_profit) {
      return res
        .status(400)
        .json({ success: false, message: "Falta el código profit" });
    }

    const nombre_cliente = full_data?.nombre || null;
    const bitacora = gestion?.bitacora || null;
    const obs_ejecutiva = gestion?.obs_ejecutiva || null;

    const semana = gestion?.semana ? JSON.stringify(gestion.semana) : null;
    const auditoria_matriz = gestion?.auditoria_matriz
      ? JSON.stringify(gestion.auditoria_matriz)
      : null;

    const query = `
            INSERT INTO matrix (
                id_bitrix, 
                codigo_profit, 
                nombre_cliente, 
                bitacora, 
                obs_ejecutiva, 
                semana, 
                auditoria_matriz
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                id_bitrix = VALUES(id_bitrix),
                nombre_cliente = VALUES(nombre_cliente),
                bitacora = VALUES(bitacora),
                obs_ejecutiva = VALUES(obs_ejecutiva),
                semana = VALUES(semana),
                auditoria_matriz = VALUES(auditoria_matriz),
                updated_at = NOW()
        `;

    const values = [
      id_bitrix,
      codigo_profit,
      nombre_cliente,
      bitacora,
      obs_ejecutiva,
      semana,
      auditoria_matriz,
    ];

    const [result] = await pool.query(query, values);

    res.status(200).json({
      success: true,
      message: "Datos guardados/actualizados correctamente",
      data: {
        id: result.insertId || result.info,
        codigo_profit,
      },
    });
  } catch (error) {
    console.error("Error en saveMatrixData:", error);
    res.status(500).json({
      error: "Error al guardar los datos de la matriz",
      details: error.message,
    });
  }
};
