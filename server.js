import express from "express";
import bodyParser from "body-parser";

const app = express();

// Aumenta el límite a 10mb (ajusta según lo que necesites)
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ limit: "10mb", extended: true }));

export default app;
