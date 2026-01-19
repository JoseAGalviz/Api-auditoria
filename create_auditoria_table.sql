-- Tabla para guardar registros de auditoría
-- Esta tabla elimina redundancia guardando la estructura compleja en JSON y extrayendo los identificadores clave.

USE auditoria;

CREATE TABLE IF NOT EXISTS registros_auditoria (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_bitrix VARCHAR(50),
    codigo_profit VARCHAR(50),
    nombre_cliente VARCHAR(255),
    bitacora TEXT COMMENT 'Texto de la bitácora',
    obs_ejecutiva TEXT COMMENT 'Observaciones de la ejecutiva',
    plan_semana JSON COMMENT 'Objeto con la planificación semanal (lunes a viernes)',
    datos_cliente JSON COMMENT 'Resto de datos financieros y de contacto (sin duplicados)',
    fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_id_bitrix (id_bitrix),
    INDEX idx_codigo_profit (codigo_profit),
    INDEX idx_fecha (fecha_registro)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
