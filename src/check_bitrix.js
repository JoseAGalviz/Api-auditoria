import fetch from "node-fetch";
import fs from "fs";

const BITRIX_FIELDS_URL = "https://cristmedical.bitrix24.es/rest/5149/b4eirrr8ila4cpzk/crm.company.fields.json";

async function checkFields() {
    try {
        const response = await fetch(BITRIX_FIELDS_URL);
        const data = await response.json();
        const results = {};
        for (const [key, value] of Object.entries(data.result)) {
            // Buscamos campos de tipo LIST o que tengan Segmento en el nombre
            if (value.type === "enumeration" || (value.formLabel && value.formLabel.includes("Segmento")) || (value.title && value.title.includes("Segmento"))) {
                results[key] = {
                    title: value.title,
                    formLabel: value.formLabel,
                    items: value.items || value.LIST
                };
            }
        }
        fs.writeFileSync("bitrix_fields_debug.json", JSON.stringify(results, null, 2));
        console.log("Campos guardados en bitrix_fields_debug.json");
    } catch (e) {
        console.error(e);
    }
}

checkFields();
