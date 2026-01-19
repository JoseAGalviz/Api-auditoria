import sql from "mssql";
import mysql from "mysql2/promise";

// SQL Server configuration (remote - Profit)
export const remoteConfig = {
  user: process.env.SQL_USER || "profit",
  password: process.env.SQL_PASSWORD || "profit",
  server: process.env.SQL_SERVER || "192.168.4.20",
  port: parseInt(process.env.SQL_PORT) || 1433,
  database: process.env.SQL_DATABASE || "CRISTM25",
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
  requestTimeout: 30000, // 30 seconds timeout for queries
};

// MySQL configuration (local - app)
export const localConfig = {
  host: process.env.MYSQL_HOST || "192.168.4.23",
  user: process.env.MYSQL_USER || "desarrollo",
  password: process.env.MYSQL_PASSWORD || "E-xUUctByBsPTe7A",
  database: process.env.MYSQL_DATABASE || "auditoria",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

// MySQL configuration (local - app)
export const appConfig = {
  host: process.env.MYSQL_APP_HOST || "192.168.4.23",
  user: process.env.MYSQL_APP_USER || "desarrollo",
  password: process.env.MYSQL_APP_PASSWORD || "E-xUUctByBsPTe7A",
  database: process.env.MYSQL_APP_DATABASE || "app",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

export let mysqlPool = null;
export let appPool = null;

/**
 * Connects to the specified database
 * @param {string} configType - "remote" for SQL Server, "local" for MySQL
 */
export async function connectDB(configType = "remote") {
  try {
    if (configType === "local") {
      mysqlPool = await mysql.createPool(localConfig);
      console.log("✓ Connected to MySQL (auditoria)");
    } else if (configType === "app") {
      appPool = await mysql.createPool(appConfig);
      console.log("✓ Connected to MySQL (app)");
    } else {
      await sql.connect(remoteConfig);
      console.log("✓ Connected to SQL Server (remote)");
    }
  } catch (err) {
    console.error(`✗ Database connection error (${configType}):`, err.message);
  }
}

/**
 * Returns the MySQL connection pool
 * @returns {mysql.Pool|null} MySQL pool instance
 */
export function getMysqlPool() {
  return mysqlPool;
}

/**
 * Returns the App MySQL connection pool
 * @returns {mysql.Pool|null} App MySQL pool instance
 */
export function getAppPool() {
  return appPool;
}

export { sql };
