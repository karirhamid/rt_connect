from fastapi.testclient import TestClient
import traceback

from main import app

def run():
    client = TestClient(app)
    try:
        print('Calling POST /api/auth/login as admin...')
        resp = client.post('/api/auth/login', json={'username': 'admin', 'password': 'admin123'})
        print('login status:', resp.status_code)
        print('login body:', resp.text)

        token = None
        try:
            token = resp.json().get('access_token')
        except Exception:
            pass

        headers = {'Authorization': f'Bearer {token}'} if token else {}

        print('\nCalling GET /api/users/roles with Authorization header...')
        r = client.get('/api/users/roles', headers=headers)
        print('roles status:', r.status_code)
        print('roles body:', r.text)

    except Exception:
        print('Exception while exercising endpoints:')
        traceback.print_exc()

if __name__ == '__main__':
    run()
