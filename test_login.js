import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:8001';

async function testLogin() {
    console.log('Testing correct endpoint: /api/usuarios/login');
    try {
        const response = await fetch(`${BASE_URL}/api/usuarios/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario: 'test', contraseña: 'test' })
        });
        
        console.log(`Status: ${response.status}`);
        if (response.headers.get('content-type')?.includes('application/json')) {
            const data = await response.json();
            console.log('Response:', data);
        } else {
            console.log('Response is not JSON');
        }

    } catch (error) {
        console.error('Error:', error);
    }

    console.log('\nTesting incorrect endpoint: /api/usuarios/login/login');
    try {
        const response = await fetch(`${BASE_URL}/api/usuarios/login/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario: 'test', contraseña: 'test' })
        });
        
        console.log(`Status: ${response.status}`);
        if (response.headers.get('content-type')?.includes('application/json')) {
            const data = await response.json();
            console.log('Response:', data);
        } else {
            console.log('Response is not JSON (likely HTML 404)');
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

testLogin();
