
import fetch from "node-fetch";

async function verify() {
    try {
        console.log("Verifying /api/clientes/companies with pagination...");

        // First request to get the next cursor
        console.log("Fetching page 1...");
        const response1 = await fetch("http://localhost:8001/api/clientes/companies");
        const data1 = await response1.json();

        if (data1.success && data1.next) {
            console.log("✓ Page 1 Success. Next cursor:", data1.next);

            // Second request using the cursor
            console.log(`Fetching page 2 using start=${data1.next}...`);
            const response2 = await fetch(`http://localhost:8001/api/clientes/companies?start=${data1.next}`);
            const data2 = await response2.json();

            if (data2.success) {
                console.log("✓ Page 2 Success. Count:", data2.count);
                if (data2.data.length > 0) {
                    console.log("Sample data from page 2:", data2.data[0].ID);
                }
            } else {
                console.error("✗ Page 2 failed:", data2);
            }

        } else {
            if (data1.success) {
                console.warn("! Page 1 success but no 'next' cursor found. Maybe fewer than 50 records?");
            } else {
                console.error("✗ Page 1 failed:", data1);
            }
        }

    } catch (error) {
        console.error("✗ Request failed:", error.message);
    }
}

verify();
