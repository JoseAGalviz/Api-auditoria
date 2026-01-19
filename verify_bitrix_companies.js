
import fetch from "node-fetch";

async function verify() {
    try {
        console.log("Verifying /api/clientes/companies...");
        const response = await fetch("http://localhost:8001/api/clientes/companies");
        const data = await response.json();

        if (data.success) {
            console.log("✓ Success! Count:", data.count);
            if (data.data.length > 0) {
                console.log("Sample data:", data.data[0]);
                const requiredFields = [
                    "ID",
                    "TITLE",
                    "UF_CRM_1634787828",
                    "UF_CRM_1635903069",
                    "UF_CRM_1638457710",
                    "UF_CRM_1651251237102",
                    "UF_CRM_1686015739936"
                ];

                const missingFields = requiredFields.filter(field => !Object.prototype.hasOwnProperty.call(data.data[0], field));

                if (missingFields.length === 0) {
                    console.log("✓ All required fields are present.");
                    console.log("Field Values Check:");
                    requiredFields.forEach(field => {
                        if (field.startsWith("UF_")) {
                            console.log(`${field}:`, data.data[0][field]);
                        }
                    });
                } else {
                    console.warn("! Missing fields in first record:", missingFields);
                    console.log("Note: Bitrix24 might omit empty fields.");
                }
            } else {
                console.warn("! No data returned (count is 0).");
            }
        } else {
            console.error("✗ API returned error:", data);
        }

    } catch (error) {
        console.error("✗ Request failed:", error.message);
    }
}

verify();
