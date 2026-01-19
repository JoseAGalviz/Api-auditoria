
import fetch from "node-fetch";

async function verify() {
    try {
        console.log("Verifying /api/usuarios/segmentos-profit...");
        const response = await fetch("http://localhost:8001/api/usuarios/segmentos-profit");
        const data = await response.json();

        if (data.success) {
            console.log("✓ Success! Count:", data.count);
            if (data.data.length > 0) {
                console.log("Sample data:", data.data[0]);
                if (data.data[0].co_seg && data.data[0].seg_des) {
                    console.log("✓ Fields co_seg and seg_des are present.");
                } else {
                    console.error("✗ Missing expected fields co_seg or seg_des.");
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
