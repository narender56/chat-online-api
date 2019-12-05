const app = require('express')()
const server = require('http').Server(app)
const cors = require('cors')
const Sentry = require('@sentry/node')

Sentry.init({ dsn: 'https://1b98a9bea5c04421a9524485215f8ad5@sentry.io/1832344' })

app.use(cors())
app.use(Sentry.Handlers.requestHandler())

app.use(Sentry.Handlers.errorHandler({
  shouldHandleError(error) {
    // Capture all 404 and 500 errors
    if (error.status === 404 || error.status === 500) {
      return true
    }
    return false
  }
}))

const port = 8081

app.get('/', (req, res) => res.json({health: 'ok', status: 'success'}))

const io = require('socket.io')(server)
io.males = 0
io.females = 0
io.trans = 0
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
    socket.randomPersonSocketId = randomSocketId
    randomPersonSocket.randomPersonSocketId = socket.id
    socket.emit('chatConnected', randomPersonSocket.gender)
    randomPersonSocket.emit('chatConnected', socket.gender)
  }
}

const disconnect = (socket) => {
  const randomPersonSocket = getRandomSocket(socket.randomPersonSocketId)
  if (randomPersonSocket) {
    delete randomPersonSocket.randomPersonSocketId
    randomPersonSocket.emit('chatDisconnected')
  }
  delete socket.randomPersonSocketId
  socket.emit('chatDisconnected')
}

const updateGendersCount = (gender, flag) => {
  if (gender === 'Male') flag ? io.males += 1 : io.males -= 1
  if (gender === 'Female') flag ? io.females += 1 : io.females -= 1
  if (gender === 'Trans') flag ? io.trans += 1 : io.trans -= 1
  return { males: io.males, females: io.females, trans: io.trans }
}

io.on('connection', function (socket) {
  socket.on('gender', function(gender) {
    socket.gender = gender
    const genderObj = updateGendersCount(gender, true)
    io.emit('gendersCount', genderObj)
  })

  socket.on('leave-room', function() {
    disconnect(socket)
  })

  socket.on('connect-new-room', function() {
    if (io.engine.clientsCount > 1) connectRooms(socket)
  })

  socket.on('user-typing', function(flag) {
    const randomPersonSocket = getRandomSocket(socket.randomPersonSocketId)
    if (randomPersonSocket) randomPersonSocket.emit('strangerIsTyping', flag)
    else disconnect()
  })

  socket.on('message', function({ message, time }) {
    const randomPersonSocket = getRandomSocket(socket.randomPersonSocketId)
    if (randomPersonSocket) randomPersonSocket.emit('messageReceived', { message, time })
    else disconnect()
  })

  socket.on('disconnect', function () {
    disconnect(socket)
    const genderObj = updateGendersCount(socket.gender, false)
    io.emit('gendersCount', genderObj)
  })
})

server.listen(port, () => console.log(`Server listening on port ${port}!`))
