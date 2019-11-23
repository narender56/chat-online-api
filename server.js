const app = require('express')()
const server = require('http').Server(app)
const cors = require('cors')

app.use(cors())
const port = 8081

app.get('/', (req, res) => res.json({health: 'ok', status: 'success'}))

const io = require('socket.io')(server)

const generateRandomIndex = (from = 0, to = 1) => Math.floor(Math.random() * to) + from

const getRandomSocketId = (list, index, currentSocket) => {
  if (list[index] === currentSocket) {
    let newIndex = generateRandomIndex(0, io.engine.clientsCount - 1)
    if (index === newIndex) newIndex++
    return getRandomSocketId(list, newIndex, currentSocket)
  }

  return list[index]
}

const getRandomSocket = (socketId) => io.sockets.connected[socketId]

const connectRooms = (socket) => {
  const index = generateRandomIndex(0, io.engine.clientsCount - 1)
  const connectedSockets = Object.keys(io.sockets.connected)
  const randomSocketId = getRandomSocketId(connectedSockets, index, socket.id)
  const randomPersonSocket = getRandomSocket(randomSocketId)

  if (!socket.randomPersonSocketId && !randomPersonSocket.randomPersonSocketId) {
    const room = `${socket.id}_${randomSocketId}`
    
    socket.randomPersonSocketId = randomSocketId
    randomPersonSocket.randomPersonSocketId = socket.id
    if (socket.room) {
      socket.leave(socket.room)
    }

    if (randomPersonSocket.room) {
      randomPersonSocket.leave(randomPersonSocket.room)
    }
    
    socket.room = room
    randomPersonSocket.room = room

    socket.join(room)
    randomPersonSocket.join(room)
    socket.emit('roomName', room)
    randomPersonSocket.emit('roomName', room)
  }
}

io.on('connection', function (socket) {
  io.emit('userCount', io.engine.clientsCount)

  socket.on('leave-room', function(room) {
    const randomPersonSocket = getRandomSocket(socket.randomPersonSocketId)
    socket.leave(room)
    delete socket.randomPersonSocketId
    if (randomPersonSocket) {
      randomPersonSocket.leave(room)
      delete randomPersonSocket.randomPersonSocketId
    }
    io.in(socket.room).emit('user-disconnected')
  })

  socket.on('connect-new-room', function() {
    if (io.engine.clientsCount > 1) {
      connectRooms(socket)
    }
  })

  socket.on('message', function({ room, message, socketId, time }) {
    io.in(room).emit('receive-message', { message, socketId, time })
  })

  socket.on('disconnect', function () {
    const randomPersonSocket = getRandomSocket(socket.randomPersonSocketId)
    io.in(socket.room).emit('user-disconnected')

    // keep this for future reference
    // io.of('/').in(socket.room).clients((error, socketIds) => {
    //   if (error) throw error;
    //   socketIds.forEach(socketId => io.sockets.sockets[socketId].leave('chat'))
    // })

    // Leave rooms
    // Empty sockets so, it will be free for next connection
    if (randomPersonSocket) {
      randomPersonSocket.emit('user-disconnected')
      delete randomPersonSocket.randomPersonSocketId
      delete io.sockets.adapter.rooms[randomPersonSocket.id]
      randomPersonSocket.leave(randomPersonSocket.room)
    }

    // Deleting room so that memory leaks reduce
    delete io.sockets.adapter.rooms[socket.id]
    delete socket.randomPersonSocketId
    io.emit('userCount', io.engine.clientsCount)
  })
})

server.listen(port, () => console.log(`Server listening on port ${port}!`))
