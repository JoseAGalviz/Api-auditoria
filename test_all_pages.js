import fetch from 'node-fetch';
import fs from 'fs';

// Configuración
const BASE_URL = 'http://192.168.4.69:8001/api/clientes/companies';
const START_FROM = 1100; // Desde qué registro comenzar
const PAGE_SIZE = 50; // Tamaño de página (ajustar según tu API)
const DELAY_MS = 100; // Pausa entre requests para no saturar el servidor
const OUTPUT_FILE = 'companies_all_pages.json';

// Estadísticas
let stats = {
    totalRecords: 0,
    totalPages: 0,
    errors: 0,
    startTime: Date.now()
};

/**
 * Obtiene una página del endpoint
 */
async function fetchPage(start) {
    try {
        const url = `${BASE_URL}?start=${start}`;
        console.log(`📡 Consultando: start=${start}...`);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 30000 // 30 segundos timeout
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`❌ Error en start=${start}:`, error.message);
        stats.errors++;
        return null;
    }
}

/**
 * Pausa la ejecución por X milisegundos
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Formatea el tiempo transcurrido
 */
function formatElapsedTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return minutes > 0 ? `${minutes}m ${secs}s` : `${secs}s`;
}

/**
 * Función principal
 */
async function fetchAllPages() {
    console.log('🚀 Iniciando consulta de todas las páginas...');
    console.log(`📍 Endpoint: ${BASE_URL}`);
    console.log(`📊 Comenzando desde: ${START_FROM}`);
    console.log(`⏱️  Delay entre requests: ${DELAY_MS}ms\n`);

    let start = START_FROM;
    let allData = [];
    let hasMore = true;
    let emptyResponses = 0;

    while (hasMore) {
        const pageData = await fetchPage(start);

        if (pageData === null) {
            // Error en la petición
            console.log(`⚠️  Error al obtener datos, intentando continuar...\n`);

            // Si hay muchos errores consecutivos, detener
            if (stats.errors > 5) {
                console.log('❌ Demasiados errores consecutivos. Deteniendo...');
                break;
            }

            start += PAGE_SIZE;
            await sleep(DELAY_MS * 2); // Esperar más tiempo después de un error
            continue;
        }

        // Verificar si hay datos
        const records = Array.isArray(pageData) ? pageData : (pageData.data || []);
        const recordCount = records.length;

        if (recordCount === 0) {
            emptyResponses++;
            console.log(`ℹ️  Respuesta vacía (${emptyResponses}/3)\n`);

            // Si obtenemos 3 respuestas vacías consecutivas, asumimos que terminamos
            if (emptyResponses >= 3) {
                console.log('✅ No hay más datos. Finalizando...\n');
                hasMore = false;
                break;
            }

            start += PAGE_SIZE;
            await sleep(DELAY_MS);
            continue;
        }

        // Resetear contador de respuestas vacías
        emptyResponses = 0;

        // Agregar datos
        allData = allData.concat(records);
        stats.totalRecords += recordCount;
        stats.totalPages++;

        console.log(`✓ Página ${stats.totalPages}: ${recordCount} registros`);
        console.log(`  Total acumulado: ${stats.totalRecords} registros`);
        console.log(`  Tiempo transcurrido: ${formatElapsedTime(Date.now() - stats.startTime)}\n`);

        // Avanzar a la siguiente página
        start += PAGE_SIZE;

        // Pausa para no saturar el servidor
        await sleep(DELAY_MS);
    }

    // Guardar resultados
    try {
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allData, null, 2));
        console.log('💾 Resultados guardados en:', OUTPUT_FILE);
    } catch (error) {
        console.error('❌ Error al guardar archivo:', error.message);

        // Intentar guardar con un nombre alternativo
        const altFile = `companies_backup_${Date.now()}.json`;
        try {
            fs.writeFileSync(altFile, JSON.stringify(allData, null, 2));
            console.log('💾 Resultados guardados en:', altFile);
        } catch (err) {
            console.error('❌ No se pudo guardar el archivo');
        }
    }

    // Mostrar estadísticas finales
    console.log('\n' + '='.repeat(50));
    console.log('📊 RESUMEN FINAL');
    console.log('='.repeat(50));
    console.log(`Total de páginas consultadas: ${stats.totalPages}`);
    console.log(`Total de registros obtenidos: ${stats.totalRecords}`);
    console.log(`Errores encontrados: ${stats.errors}`);
    console.log(`Tiempo total: ${formatElapsedTime(Date.now() - stats.startTime)}`);
    console.log('='.repeat(50));

    return allData;
}

// Ejecutar
fetchAllPages()
    .then(() => {
        console.log('\n✅ Proceso completado exitosamente');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Error fatal:', error);
        process.exit(1);
    });
