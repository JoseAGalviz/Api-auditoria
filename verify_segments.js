import fetch from "node-fetch";

const getSegmentos = async () => {
    try {
        const BITRIX_URL = "https://b24-sjdauj.bitrix24.es/rest/5149/b4eirrr8ila4cpzk/crm.company.fields.json";
        const FIELD_ID = "UF_CRM_1638457710";

        console.log("Fetching segments from Bitrix24 (Fields Method)...");

        const response = await fetch(BITRIX_URL);
        const data = await response.json();

        if (!data.result || !data.result[FIELD_ID]) {
            throw new Error("Campo no encontrado en Bitrix24");
        }

        const field = data.result[FIELD_ID];
        const items = field.items || field.LIST || [];

        const segmentos = items.map(item => item.VALUE).sort();

        console.log("Segments Found:");
        console.log(segmentos);
        console.log(`Total Count: ${segmentos.length}`);

    } catch (error) {
        console.error("Error:", error);
    }
};

getSegmentos();
