
import fetch from 'node-fetch';

const API_URL = 'http://localhost:8001/api/profit-bitrix';

const measurePerformance = async () => {
    console.log('--- Starting Performance Test ---');

    // First Call (Cold Cache)
    console.log('\n1. Making FIRST request (Cold Cache)...');
    const start1 = Date.now();
    try {
        const res1 = await fetch(API_URL);
        const data1 = await res1.json();
        const end1 = Date.now();
        console.log(`Status: ${res1.status}`);
        console.log(`Success: ${data1.success}`);
        console.log(`Count: ${data1.count}`);
        if (data1.performance) console.log(`Server Reported Time: ${data1.performance.total_time_ms}ms`);
        console.log(`Client Measured Time: ${end1 - start1}ms`);
    } catch (e) {
        console.error('Request 1 Failed:', e.message);
    }

    // Wait a bit
    await new Promise(r => setTimeout(r, 2000));

    // Second Call (Warm Cache)
    console.log('\n2. Making SECOND request (Warm Cache)...');
    const start2 = Date.now();
    try {
        const res2 = await fetch(API_URL);
        const data2 = await res2.json();
        const end2 = Date.now();
        console.log(`Status: ${res2.status}`);
        console.log(`Success: ${data2.success}`);
        console.log(`Count: ${data2.count}`);
        if (data2.performance) console.log(`Server Reported Time: ${data2.performance.total_time_ms}ms`);
        console.log(`Client Measured Time: ${end2 - start2}ms`);
    } catch (e) {
        console.error('Request 2 Failed:', e.message);
    }

    console.log('\n--- Test Completed ---');
};

measurePerformance();
