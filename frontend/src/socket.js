import { io } from 'socket.io-client';
import { useStore } from './store';

let socket = null;

export const getSocket = () => {
    const token = useStore.getState().token;
    
    if (!socket) {
        socket = io({ auth: { token } });
    } else {
        // Se o token mudou (ex: relogin), atualiza a auth e reconecta
        if (socket.auth?.token !== token) {
            socket.auth = { token };
            socket.disconnect();
            socket.connect();
        }
    }
    
    return socket;
};

export const disconnectSocket = () => {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
};
