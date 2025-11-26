import psycopg2
conn = psycopg2.connect(host='localhost', port='5432', user='postgres', password='hk2025@AnzadbPss.', database='rtzkconnect_db')
cur = conn.cursor()
cur.execute("SELECT d.name, COUNT(e.id) FROM devices d LEFT JOIN employees e ON e.source_device_id = d.id GROUP BY d.name ORDER BY d.name")
print('\nEmployees per device:')
for row in cur.fetchall():
    print(f'  {row[0]}: {row[1]} employees')
