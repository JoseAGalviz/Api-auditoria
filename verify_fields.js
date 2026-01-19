import fetch from "node-fetch";
import fs from "fs";

const checkFields = async () => {
    try {
        const BITRIX_URL = "https://b24-sjdauj.bitrix24.es/rest/5149/b4eirrr8ila4cpzk/crm.company.fields.json";
        const FIELD_ID = "UF_CRM_1638457710";

        console.log("Fetching fields from Bitrix24...");
        const response = await fetch(BITRIX_URL);
        const data = await response.json();

        if (data.result) {
            const field = data.result[FIELD_ID];
            if (field) {
                console.log(`Field ${FIELD_ID} found:`);
                console.log(JSON.stringify(field, null, 2));

                if (field.items) {
                    console.log("\nItems (Values):");
                    field.items.forEach(item => {
                        console.log(`- ${item.VALUE}`);
                    });
                } else if (field.LIST) {
                    console.log("\nLIST (Values):");
                    field.LIST.forEach(item => {
                        console.log(`- ${item.VALUE}`);
                    });
                }
            } else {
                console.log(`Field ${FIELD_ID} NOT found.`);
                console.log("Available fields sample:", Object.keys(data.result).slice(0, 10));
            }
        } else {
            console.log("No result data found.");
        }

    } catch (error) {
        console.error("Error:", error);
    }
};

checkFields();
