import express from "express";
import cors from "cors";
import { connectDB } from "./config/database.js";
import usuarioRoutes from "./routes/usuario.route.js";
import clienteRoutes from "./routes/cliente.route.js";
import profitBitrixRoutes from "./routes/profitBitrix.route.js";
import auditoriaRoutes from "./routes/auditoria.route.js";
import gestionRoutes from "./routes/gestion.route.js";
import matrixRoutes from "./routes/matrix.route.js";
import planificacionRoutes from "./routes/planificacion.route.js";
import { saveMatrixData } from "./controllers/matrix.controller.js";

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Middleware para capturar errores de JSON malformado
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    console.error("JSON inválido recibido:", err.message);
    return res.status(400).json({
      status: false,
      message: "El formato del JSON enviado es incorrecto (SyntaxError).",
    });
  }
  next();
});

// Database connections
connectDB("remote"); // SQL Server
connectDB("local");  // MySQL
connectDB("app");    // MySQL (app)

// Health check endpoint
app.get("/", (req, res) => {
  res.send("Api Auditoria");
});

// API Routes
app.use("/api/usuarios", usuarioRoutes);
app.use("/api/clientes", clienteRoutes);
app.use("/api/profit-bitrix", profitBitrixRoutes);
app.use("/api/auditoria", auditoriaRoutes);
app.use("/api/gestiones", gestionRoutes);
app.use("/api/matrix", matrixRoutes);
app.use("/api/planificacion", planificacionRoutes);

// Ruta específica solicitada: /matrix/planificacion -> tabla matrix
app.post("/matrix/planificacion", saveMatrixData);

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
