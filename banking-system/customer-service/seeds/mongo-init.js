// MongoDB init script — placed in /docker-entrypoint-initdb.d/
// Runs once when the MongoDB container is first initialized.

db = db.getSiblingDB('customers_db');

db.createCollection('customers');

db.customers.createIndex({ email: 1 }, { unique: true });

print('[mongo-init] customers_db initialized with customers collection and email index');
