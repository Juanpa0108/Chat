# Chat

Plantilla de servidor de chat (Socket.IO) copiada desde `eisc-chat`.

Quickstart

1. Copia `.env.example` a `.env` y ajusta `PORT` y `ORIGIN`.
2. Instala dependencias:

```powershell
cd "c:\Users\Windows 11\Desktop\PI1\Tercer proyecto\Chat"
npm install
```

3. Ejecuta en desarrollo:

```powershell
npm run dev
```

Conectar desde el frontend

Usa `socket.io-client` en el frontend para conectarte. Ejemplo rápido (cliente React):

```ts
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000');

socket.on('connect', () => {
	console.log('connected', socket.id);
	socket.emit('newUser', 'user-id-123');
});

socket.on('usersOnline', users => console.log('online', users));
socket.on('chat:message', msg => console.log('msg', msg));
```

Notas

- Asegúrate de añadir el origen del frontend en `ORIGIN` en `.env`.
- En producción, expone `PORT` apropiadamente y configura el proxy o la URL del socket en el frontend.
