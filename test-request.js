import http from 'http';

http.get('http://localhost:3002/api/trpc/discipline.list', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('Response:', res.statusCode, data));
}).on('error', err => console.log('Error:', err.message));
