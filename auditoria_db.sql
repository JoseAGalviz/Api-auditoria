-- Script para crear la base de datos 'auditoria' y sus tablas
-- Generado basado en api-auditoria/src/controllers/usuario.controller.js

-- 1. Crear la base de datos si no existe
CREATE DATABASE IF NOT EXISTS auditoria CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2. Seleccionar la base de datos
USE auditoria;

-- 3. Crear la tabla 'usuarios'
CREATE TABLE IF NOT EXISTS usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario VARCHAR(50) NOT NULL UNIQUE,
    contraseña_hash VARCHAR(255) NOT NULL,
    segmentos JSON DEFAULT NULL COMMENT 'Almacena array de segmentos permitidos',
    permisos JSON DEFAULT NULL COMMENT 'Almacena configuración de permisos',
    status TINYINT(1) DEFAULT 1 COMMENT '1: Activo, 0: Inactivo (Soft Delete)',
    fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. (Opcional) Insertar un usuario administrador por defecto
-- Usuario: admin, Password: 123 (debes generar el hash con bcrypt para que funcione en la API)
-- INSERT INTO usuarios (usuario, contraseña_hash, status, fecha_registro) VALUES ('admin', '$2b$10$TuHashAqui...', 1, NOW());
