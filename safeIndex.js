const express = require('express')
const http = require('http')
const path = require('path')
const socketIO = require('socket.io')
var app = express()
var server = http.Server(app)
port = process.env.PORT || 5001
var io = socketIO(server); app.set('port', port)
app.use('/client', express.static(__dirname + '/client'))
app.get('/', function(request, response) {
	response.sendFile(path.join(__dirname + '/client', 'index.html'))
});
server.listen(port, () => {
	console.log('Starting server at 5001 port')
})

class Vector {
	constructor(x, y) {
		this.x = x
		this.y = y
	}
	add(otherVector) {
		return new Vector(this.x + otherVector.x, this.y + otherVector.y)
	}
	multiply(scale) {
		return new Vector(this.x * scale, this.y * scale)
	}
	dot(otherVector) {
		return this.x * otherVector.x + this.y * otherVector.y
	}
	getAngle() {
		return Math.atan(-this.y/this.x)
	}
}

function fromAngle(angle){
	return new Vector(Math.cos(angle), Math.sin(angle))
}

var AIRFRICTION = 0.95

class Player {
	constructor(x, y){
		this.pos = new Vector(x, y)
		this.vel = new Vector(0, 0)
		this.accel = new Vector(0, 0)
		this.input = []
		this.color = [Math.random() * 255, Math.random() * 255, Math.random() * 255]
		this.radius = 20
		this.collider = new BoxCollider(this, 0, 0, this.radius*2, this.radius*2)
		this.onGround = false

		this.friction = 0.5
		this.bounce = 0.3
	}
	physicsUpdate(){
		// gravity
		this.accel.x = 0
		this.accel.y = 1

		this.vel = this.vel.add(this.accel)
		this.vel = this.vel.multiply(AIRFRICTION)
		this.pos = this.pos.add(this.vel)

		this.onGround = false
	}
	takeInput(){
		if (this.input.left) {
			this.vel.x -= 1
		}
		if (this.input.right) {
			this.vel.x += 1
		}
		if (this.input.up && this.onGround) {
			this.vel.y -= 15
		}
		if (this.input.down) {
			this.vel.y += 1
		}
	}
	export(){
		return {x: this.pos.x, y: this.pos.y, color: this.color, radius: this.radius}
	}
}

class Platform {
	constructor(x, y, width, height, direction=0){
		this.pos = new Vector(x, y)
		this.size = new Vector(width, height)
		this.collider = new BoxCollider(this, 0, 0, width, height, direction)
		this.bounce = 0.7
		this.friction = 0.8
	}
	export(){
		return {x: this.pos.x, y: this.pos.y, width: this.size.x, height: this.size.y, direction: this.collider.direction}
	}
}
class BoxCollider {
	constructor(parent, offsetX, offsetY, width, height, direction){
		this.parent = parent
		this.offset = new Vector(offsetX, offsetY)
		this.size = new Vector(width, height)
		this.direction = direction
		this.normal = fromAngle(this.direction + Math.PI/2)
		this.angle = new Vector(this.size.x/2, -this.size.y/2).getAngle()
	}
	pointInside(pos) {
		if (pos.x > this.parent.pos.x-this.size.x/2 && pos.x < this.parent.pos.x+this.size.x/2 && pos.y > this.parent.pos.y-this.size.y/2 && pos.y < this.parent.pos.y+this.size.y/2) {
			return true
		}
	}
	superiorPointInside(pos) {
		pos = pos.add(this.parent.pos.multiply(-1))
		// rotate pos around origin
		pos.x = pos.x * Math.cos(this.direction) - pos.y * Math.sin(this.direction)
		pos.y = pos.x * Math.sin(this.direction) + pos.y * Math.cos(this.direction)
		if (pos.x > -this.size.x/2 && pos.x < +this.size.x/2 && pos.y > -this.size.y/2 && pos.y < +this.size.y/2) {
			return true
		}
	}
	corners() {
		return [
			this.parent.pos.add(new Vector(-this.size.x/2, -this.size.y/2)), 
			this.parent.pos.add(new Vector(this.size.x/2, -this.size.y/2)), 
			this.parent.pos.add(new Vector(-this.size.x/2, this.size.y/2)), 
			this.parent.pos.add(new Vector(this.size.x/2, this.size.y/2)),
		]
	}
	isCollideBox(box) {
		// check if this corners are in box
		let corners = this.corners()
		for (var i in corners){
			if (box.superiorPointInside(corners[i])) {
				return true
			}
		}
		// check if box corners are in this
		corners = box.corners()
		for (var i in corners){
			if (this.superiorPointInside(corners[i])) {
				return true
			}
		};
			
	}
	collideBox(box) {
		if (!this.isCollideBox(box)) {
			return
		}
		let angle = box.parent.pos.add(this.parent.pos.multiply(-1)).getAngle();
		// if on left side
		if (box.parent.pos.x < this.parent.pos.x) {
			angle += Math.PI
		}
		if (angle < Math.PI - this.angle && angle > this.angle) {
			return 'top'
		} else if (angle < this.angle && angle > -this.angle) {
			return 'right'
		} else if (angle < Math.PI + this.angle && angle > Math.PI - this.angle) {
			return 'left'
		} else {
			return 'bottom'
		}

	}
}


players = {}
platforms = [new Platform(200, 100, 200, 100), new Platform(400, 700, 1600, 100), new Platform(400, 400, 100, 300)]

io.on('connection', socket => {
	socket.on('new player', function(){
		players[socket.id] = new Player(100, 100)
		socket.emit('your id', socket.id)
	})
	socket.on('input', data => {
		if(players[socket.id]){
			players[socket.id].input = data
		}
	});
	socket.on('disconnect', () => {
		delete players[socket.id]
	})
})
function handleCollide(collide, player, box) {
	if (collide)  {
		if (collide == 'top') {
			player.vel.y *= -box.bounce
			player.pos.y = box.pos.y - box.collider.size.y/2 - player.collider.size.y/2
			player.onGround = true
		}
		else if (collide == 'right') {
			player.vel.x *= -box.bounce
			player.pos.x = box.pos.x + box.collider.size.x/2 + player.collider.size.x/2
		}
		else if (collide == 'left') {
			player.vel.x *= -box.bounce
			player.pos.x = box.pos.x - box.collider.size.x/2 - player.collider.size.x/2
		}
		else if (collide == 'bottom') {
			player.vel.y *= -box.bounce
			player.pos.y = box.pos.y + box.collider.size.y/2 + player.collider.size.y/2
		}
	}
}
function betterHandleCollide(collide, player, box) {
	if (collide) {
		let useNormal = false;
		let change = 0;
		if (collide == 'top') {
			change = box.pos.y - box.collider.size.y/2 - player.collider.size.y/2 - player.pos.y
		}
		else if (collide == 'right') {
			useNormal = true;
			change = box.pos.x + box.collider.size.x/2 + player.collider.size.x/2 - player.pos.x
		}
		else if (collide == 'left') {
			useNormal = true;
			change = box.pos.x - box.collider.size.x/2 - player.collider.size.x/2 - player.pos.x
		}
		else if (collide == 'bottom') {
			change = box.pos.y + box.collider.size.y/2 + player.collider.size.y/2 - player.pos.y
		}
		console.log(box.collider.normal)
	}
}
function handleCollisions(player) {
	for (var i in platforms) {
		let collide = platforms[i].collider.collideBox(player.collider)
		betterHandleCollide(collide, player, platforms[i])
	}
	for (var key in players) {
		let collide = players[key].collider.collideBox(player.collider)
		handleCollide(collide, player, players[key])
	}
}
setInterval(function(){
	for (var key in players) {
		players[key].takeInput()
		players[key].physicsUpdate()
		handleCollisions(players[key])
	}
	io.sockets.emit('game state', {
		players: Object.values(players).map(player => player.export()),
		platforms: platforms.map(platform => platform.export())
	}
	);
}, 1000/60)






