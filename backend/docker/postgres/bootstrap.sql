\getenv migrator_password CROC_DB_MIGRATOR_PASSWORD
\getenv reader_password CROC_DB_READER_PASSWORD

BEGIN;

CREATE ROLE croc_migrator LOGIN PASSWORD :'migrator_password';
CREATE ROLE croc_reader LOGIN PASSWORD :'reader_password';

ALTER DATABASE croc_insight OWNER TO croc_migrator;
REVOKE CONNECT, TEMPORARY ON DATABASE croc_insight FROM PUBLIC;
GRANT CONNECT ON DATABASE croc_insight TO croc_reader;

REVOKE ALL ON SCHEMA public FROM PUBLIC;
CREATE SCHEMA insight AUTHORIZATION croc_migrator;
GRANT USAGE ON SCHEMA insight TO croc_reader;

COMMIT;
