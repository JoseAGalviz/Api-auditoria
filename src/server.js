import express from "express";
import cors from "cors";
import { connectDB } from "./config/database.js";
import usuarioRoutes from "./routes/usuario.route.js";
import clienteRoutes from "./routes/cliente.route.js";
import profitBitrixRoutes from "./routes/profitBitrix.route.js";
import auditoriaRoutes from "./routes/auditoria.route.js";
import gestionRoutes from "./routes/gestion.route.js";
import matrixRoutes from "./routes/matrix.route.js";

const app = express();
const PORT = process.env.PORT || 8001;

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));

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

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
