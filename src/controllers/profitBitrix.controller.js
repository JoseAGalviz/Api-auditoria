import { sql } from "../config/database.js";
import fetch from "node-fetch";

// ==================== UTILIDADES DE COORDENADAS ====================

/**
 * Parsea una cadena de coordenadas a un objeto {lat, lng}
 * Soporta múltiples formatos:
 * - "lat,lng" (ej: "10.5,-66.9")
 * - "lat, lng" (con espacios)
 * - JSON string: '{"lat":10.5,"lng":-66.9}'
 * @param {string} coordString - Cadena con coordenadas
 * @returns {{lat: number, lng: number} | null} - Objeto con coordenadas o null si es inválido
 */
const parseCoordinates = (coordString) => {
    if (!coordString || coordString === null || coordString === undefined) {
        return null;
    }

    // Limpiar la cadena
    let cleaned = typeof coordString === 'string' ? coordString.trim() : String(coordString).trim();

    if (cleaned === '' || cleaned === 'null' || cleaned === 'undefined') {
        return null;
    }

    try {
        // Intentar parsear como JSON
        if (cleaned.startsWith('{') || cleaned.startsWith('[')) {
            const parsed = JSON.parse(cleaned);
            if (parsed.lat !== undefined && parsed.lng !== undefined) {
                return {
                    lat: parseFloat(parsed.lat),
                    lng: parseFloat(parsed.lng)
                };
            }
            if (parsed.latitude !== undefined && parsed.longitude !== undefined) {
                return {
                    lat: parseFloat(parsed.latitude),
                    lng: parseFloat(parsed.longitude)
                };
            }
        }

        // Intentar parsear como "lat,lng"
        if (cleaned.includes(',')) {
            const parts = cleaned.split(',').map(p => p.trim());
            if (parts.length === 2) {
                const lat = parseFloat(parts[0]);
                const lng = parseFloat(parts[1]);

                if (!isNaN(lat) && !isNaN(lng)) {
                    // Validar rangos de coordenadas
                    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                        return { lat, lng };
                    }
                }
            }
        }
    } catch (error) {
        // Si falla el parseo, retornar null
        return null;
    }

    return null;
};

/**
 * Calcula la distancia entre dos coordenadas usando la fórmula de Haversine
 * @param {{lat: number, lng: number}} coord1 - Primera coordenada
 * @param {{lat: number, lng: number}} coord2 - Segunda coordenada
 * @returns {number} - Distancia en kilómetros
 */
const calculateDistance = (coord1, coord2) => {
    const R = 6371; // Radio de la Tierra en km

    const dLat = (coord2.lat - coord1.lat) * Math.PI / 180;
    const dLng = (coord2.lng - coord1.lng) * Math.PI / 180;

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(coord1.lat * Math.PI / 180) * Math.cos(coord2.lat * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return distance;
};

/**
 * Compara dos coordenadas y determina su relación
 * @param {string} profitCoord - Coordenadas de Profit (campo3)
 * @param {string} bitrixCoord - Coordenadas de Bitrix (UF_CRM_1651251237102)
 * @returns {object} - Objeto con estado, distancia y coordenadas parseadas
 */
const compareCoordinates = (profitCoord, bitrixCoord) => {
    const profit = parseCoordinates(profitCoord);
    const bitrix = parseCoordinates(bitrixCoord);

    // Casos donde falta información
    if (!profit && !bitrix) {
        return {
            status: 'MISSING_BOTH',
            distance_km: null,
            profit_coords: null,
            bitrix_coords: null
        };
    }

    if (!profit) {
        return {
            status: 'MISSING_PROFIT',
            distance_km: null,
            profit_coords: null,
            bitrix_coords: bitrix
        };
    }

    if (!bitrix) {
        return {
            status: 'MISSING_BITRIX',
            distance_km: null,
            profit_coords: profit,
            bitrix_coords: null
        };
    }

    // Ambas coordenadas existen, calcular distancia
    const distance = calculateDistance(profit, bitrix);

    let status;
    if (distance < 0.05) {
        status = 'MATCH'; // Menos de 50 metros
    } else if (distance < 1) {
        status = 'CLOSE'; // Entre 50m y 1km
    } else {
        status = 'FAR'; // Más de 1km
    }

    return {
        status,
        distance_km: Math.round(distance * 1000) / 1000, // Redondear a 3 decimales
        profit_coords: profit,
        bitrix_coords: bitrix
    };
};

// ==================== CONTROLADOR PRINCIPAL ====================

/**
 * Obtener datos de clientes desde Profit con información de zonas, segmentos y Bitrix24
 * @route GET /api/profit-bitrix
 * @queryParam {string} co_zon - Filtrar por código de zona (opcional)
 * @queryParam {string} co_seg - Filtrar por código de segmento (opcional)
 */
export const getProfitBitrixData = async (req, res) => {
    const startTime = Date.now();

    try {
        const { co_zon, co_seg } = req.query;

        // ========== OPTIMIZACIÓN: CONSULTAS EN PARALELO ==========

        // Función para obtener datos de Profit
        const getProfitData = async () => {
            const sqlStartTime = Date.now();

            const pool = await sql.connect();
            const request = pool.request();

            // Construir la query base
            let query = `
                SELECT 
                    c.co_cli,
                    c.cli_des,
                    c.co_zon,
                    z.zon_des,
                    c.co_seg,
                    s.seg_des,
                    c.campo3
                FROM clientes c WITH (NOLOCK)
                LEFT JOIN zona z WITH (NOLOCK) ON c.co_zon = z.co_zon
                LEFT JOIN segmento s WITH (NOLOCK) ON c.co_seg = s.co_seg
            `;

            // Agregar filtros si se proporcionan
            const filters = [];

            if (co_zon) {
                filters.push('c.co_zon = @co_zon');
                request.input('co_zon', co_zon);
            }

            if (co_seg) {
                filters.push('c.co_seg = @co_seg');
                request.input('co_seg', co_seg);
            }

            if (filters.length > 0) {
                query += ' WHERE ' + filters.join(' AND ');
            }

            const result = await request.query(query);

            const sqlEndTime = Date.now();
            console.log(`[PERFORMANCE] SQL Query: ${sqlEndTime - sqlStartTime}ms`);

            // Limpiar y formatear los datos de Profit
            return result.recordset.map(row => ({
                co_cli: typeof row.co_cli === 'string' ? row.co_cli.trim() : row.co_cli,
                cli_des: typeof row.cli_des === 'string' ? row.cli_des.trim() : row.cli_des,
                co_zon: typeof row.co_zon === 'string' ? row.co_zon.trim() : row.co_zon,
                zon_des: typeof row.zon_des === 'string' ? row.zon_des.trim() : row.zon_des,
                co_seg: typeof row.co_seg === 'string' ? row.co_seg.trim() : row.co_seg,
                seg_des: typeof row.seg_des === 'string' ? row.seg_des.trim() : row.seg_des,
                campo3: typeof row.campo3 === 'string' ? row.campo3.trim() : row.campo3
            }));
        };

        // ========== CACHE GLOBAL PARA BITRIX ==========
        let bitrixCache = {
            data: null,
            timestamp: 0,
            ttl: 1000 * 60 * 5 // 5 minutos de validez
        };

        // Función para obtener datos de Bitrix24 usando BATCH y CACHE
        const getBitrixData = async () => {
            const now = Date.now();

            // 1. Revisar caché
            if (bitrixCache.data && (now - bitrixCache.timestamp < bitrixCache.ttl)) {
                console.log('[PERFORMANCE] Usando datos cacheados de Bitrix');
                return bitrixCache.data;
            }

            console.log('[PERFORMANCE] Cache espirado o inexistente. Consultando Bitrix...');
            const bitrixStartTime = Date.now();

            const WEBHOOK_URL = "https://b24-sjdauj.bitrix24.es/rest/5149/qly93wxo8xvetemt/";

            // 2. Obtener el total de compañías primero
            const countResponse = await fetch(`${WEBHOOK_URL}crm.company.list.json`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    select: ["ID"],
                    start: 0
                })
            });
            const countData = await countResponse.json();
            const total = countData.total;

            console.log(`[PERFORMANCE] Total de compañías en Bitrix: ${total}`);

            let allBitrixCompanies = [];
            const commandsPerBatch = 50; // Límite de comandos por llamada batch
            const recordsPerCommand = 50; // Límite de registros por comando list

            // 3. Generar todos los comandos necesarios
            // Cada comando trae 50 registros.
            // Para traer 'total' necesitamos ceil(total / 50) comandos.
            let commands = [];
            for (let i = 0; i < total; i += recordsPerCommand) {
                commands.push({
                    cmd: `crm.company.list?start=${i}&select[]=ID&select[]=UF_CRM_1634787828&select[]=UF_CRM_1651251237102`,
                    id: `cmd_${i}`
                });
            }

            // 4. Agrupar comandos en lotes de 50 para la llamada batch
            const batches = [];
            for (let i = 0; i < commands.length; i += commandsPerBatch) {
                const batchCommands = commands.slice(i, i + commandsPerBatch);
                const cmdObject = {};
                batchCommands.forEach(c => {
                    cmdObject[c.id] = c.cmd;
                });
                batches.push(cmdObject);
            }

            console.log(`[PERFORMANCE] Ejecutando ${batches.length} llamadas batch a Bitrix...`);

            // 5. Ejecutar las llamadas batch (Secuencial para no saturar, pero cada una trae 2500 reg)
            // Se podría hacer Promise.all con concurrencia limitada si fuera necesario ir más rápido,
            // pero con 50x50 = 2500 registros por request, son pocas requests.
            for (const batchCmd of batches) {
                try {
                    const response = await fetch(`${WEBHOOK_URL}batch.json`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            halt: 0,
                            cmd: batchCmd
                        })
                    });
                    const data = await response.json();

                    if (data.result && data.result.result) {
                        // data.result.result es un objeto { cmd_0: [...], cmd_50: [...] }
                        Object.values(data.result.result).forEach(chunk => {
                            if (Array.isArray(chunk)) {
                                allBitrixCompanies = allBitrixCompanies.concat(chunk);
                            }
                        });
                    }
                } catch (err) {
                    console.error("[ERROR] Falló una llamada batch a Bitrix:", err);
                }
            }

            const bitrixEndTime = Date.now();
            console.log(`[PERFORMANCE] Bitrix24 Batch Query: ${bitrixEndTime - bitrixStartTime}ms. Registros: ${allBitrixCompanies.length}`);

            // 6. Procesar y guardar en caché
            const bitrixMap = {};
            allBitrixCompanies.forEach(company => {
                const co_cli = company.UF_CRM_1634787828;
                if (co_cli) {
                    const cleanCoCli = typeof co_cli === 'string' ? co_cli.trim() : co_cli;
                    bitrixMap[cleanCoCli] = {
                        bitrix_id: company.ID,
                        UF_CRM_1651251237102: company.UF_CRM_1651251237102 || null
                    };
                }
            });

            // Guardar en caché
            bitrixCache.data = bitrixMap;
            bitrixCache.timestamp = Date.now();

            return bitrixMap;
        };

        // Ejecutar consultas en paralelo
        const [profitData, bitrixMap] = await Promise.all([
            getProfitData(),
            getBitrixData()
        ]);

        const processingStartTime = Date.now();

        // Combinar datos de Profit y Bitrix24 con comparación de coordenadas
        const combinedData = profitData.map(profitClient => {
            const bitrixInfo = bitrixMap[profitClient.co_cli] || null;

            // Comparar coordenadas
            const coordinateComparison = compareCoordinates(
                profitClient.campo3,
                bitrixInfo ? bitrixInfo.UF_CRM_1651251237102 : null
            );

            return {
                profit: profitClient,
                bitrix: bitrixInfo,
                coordinate_comparison: coordinateComparison
            };
        });

        const processingEndTime = Date.now();
        console.log(`[PERFORMANCE] Data Processing: ${processingEndTime - processingStartTime}ms`);

        const totalTime = Date.now() - startTime;
        console.log(`[PERFORMANCE] Total Request Time: ${totalTime}ms`);

        res.json({
            success: true,
            count: combinedData.length,
            filters: {
                co_zon: co_zon || null,
                co_seg: co_seg || null
            },
            performance: {
                total_time_ms: totalTime
            },
            data: combinedData
        });

    } catch (error) {
        console.error("Error en getProfitBitrixData:", error);
        res.status(500).json({
            success: false,
            error: "Error al obtener datos de Profit y Bitrix24",
            details: error.message
        });
    }
};

