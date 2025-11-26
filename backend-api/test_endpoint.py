import requests
import json

# Test the current-shift endpoint
employee_id = 29
url = f"http://localhost:8000/api/employees/{employee_id}/current-shift"

print(f"Testing endpoint: {url}")
response = requests.get(url)
print(f"Status code: {response.status_code}")
print(f"Response: {json.dumps(response.json() if response.status_code != 404 else response.text, indent=2)}")
