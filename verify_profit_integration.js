
import fetch from "node-fetch";

async function verify() {
    try {
        console.log("Verifying /api/clientes/companies with Profit Integration...");
        const response = await fetch("http://localhost:8001/api/clientes/companies");
        const data = await response.json();

        if (data.success) {
            console.log("✓ Success! Count:", data.count);
            if (data.data.length > 0) {
                const firstItem = data.data[0];

                // Check structure
                if (firstItem.bitrix && firstItem.profit !== undefined) {
                    console.log("✓ Response structure is correct (has 'bitrix' and 'profit' keys).");
                    console.log("Sample Bitrix Data (ID):", firstItem.bitrix.ID);
                    console.log("Sample Bitrix Client Code:", firstItem.bitrix.UF_CRM_1634787828);

                    if (firstItem.profit) {
                        console.log("✓ Profit Data found:", firstItem.profit);
                        if (firstItem.profit.saldo_vencido !== undefined) {
                            console.log("✓ Overdue Balance (saldo_vencido) found:", firstItem.profit.saldo_vencido);
                        } else {
                            console.warn("! saldo_vencido not found in Profit data (might be 0 or null if no overdue invoices).");
                        }
                    } else {
                        console.warn("! Profit Data is null. (Matches not found or db connection issue?)");
                        console.log("Checking if we have any profit data in the first 10 items...");

                        data.data.slice(0, 10).forEach(i => {
                            console.log(`Code: '${i.bitrix.UF_CRM_1634787828}' - Profit:`, i.profit);
                        });

                        const found = data.data.slice(0, 10).find(i => i.profit);
                        if (found) {
                            console.log("✓ Found one with Profit Data:", found.profit, "for code:", found.bitrix.UF_CRM_1634787828);
                        } else {
                            console.warn("! No Profit data found in the first 10 items.");
                        }
                    }

                } else {
                    console.error("✗ Unexpected structure. Keys found:", Object.keys(firstItem));
                }
            } else {
                console.warn("! No data returned.");
            }
        } else {
            console.error("✗ API returned error:", data);
        }

    } catch (error) {
        console.error("✗ Request failed:", error.message);
    }
}

verify();
