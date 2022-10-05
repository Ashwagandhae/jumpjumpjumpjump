
var socket = io()
var id;
var debug = true;

var inLobby = false;
var inGame = false;
var inEnd = false;

effectColors = {
	'hotfoot':[0, 255, 0],
	'toad':[0,150,255], 
	'popcorn':[255, 0, 255], 
	'feather':[255, 255, 0],
	'ghost':[100, 100, 100], 
	'wellness':[255, 0, 0],
	'cactus':[0, 100, 0], 
	'crowdsurf':[255, 150, 0],
	'shirker':[150, 0, 255]
}
effectDescription = {
	'hotfoot':'speeds you up',
	'toad':'lets you jump higher', 
	'popcorn':'if you fall too far, you\'ll teleport back up', 
	'feather':'you fall more slowly',
	'ghost':'you can walk through blocks', 
	'wellness':'you regain health outside of your base',
	'cactus':'you do more damage',
	'crowdsurf':'jumping on players gives you a boost',
	'shirker':'teleport away if people try to damage you'
}
statsDescription = {
	'username':'Your name',
	'joinDate':'Started playing',
	'killCount':'Lifetime kills',
	'goalCount':'Lifetime goals',
	'gameCount':'Lifetime games played'
}
// var canvas = document.getElementById('theCanvas')
// var context = canvas.getContext('2d')
var gameStates = [null, null];
var currentState = null
var lerpFrame = 0;
var score = {red: 0, blue: 0}

document.getElementById('message').addEventListener("animationend", function(e) {
  document.getElementById('message').style.animationName = 'none';
});
socket.on('game state', data => {
	lerpFrame = 0;
	gameStates.push(data)
	gameStates.shift()
	currentState = gameStates[0]
});
socket.on('score update', data =>{
	if (!data.rejoin) {
		var messageEl = document.getElementById('message')
		// game started
		if (data.red + data.blue == 0) {
			messageEl.style.background = 'black'
			messageEl.textContent = 'Game Started'
			messageEl.offsetHeight;
			messageEl.style.animationName = 'message'
		} else {
			// red scored
			if (data.red != Number(document.querySelector('#redScore').textContent)) {
				messageEl.style.background = 'red'
				messageEl.textContent = 'Red Scores'
				messageEl.offsetHeight;
				messageEl.style.animationName = 'message'
			// blue scored
			} else if (data.blue != Number(document.querySelector('#blueScore').textContent)){
				messageEl.style.background = 'blue'
				messageEl.textContent = 'Blue Scores'
				messageEl.offsetHeight;
				messageEl.style.animationName = 'message'
			}
		}
	}

	document.querySelector('#redScore').textContent = data.red
	document.querySelector('#blueScore').textContent = data.blue
})
socket.on('game over', data=>{
	inGame = false;
	inEnd = true;
	if (data.blue > data.red) {
		document.getElementById('gameOver').textContent = 'Blue Wins'
	} else if (data.red > data.blue){
		document.getElementById('gameOver').textContent = 'Red Wins'
	} else {
		document.getElementById('gameOver').textContent = 'Tie, somehow?'
	}
	document.getElementById('gameOver').style.display = 'block'
})
socket.on('lobby', data =>{
	inLobby = data.inLobby;
	if (inLobby) {
		document.getElementById('scoreBoard').style.display = 'none';
		document.getElementById('playerCount').style.display = 'block';
		document.getElementById('playerCount').textContent = data.playerCount.toString() + '/' + data.maxSize.toString() + ' players'
	} else {
		document.getElementById('scoreBoard').style.display = 'block';
		document.getElementById('playerCount').style.display = 'none';
	}
})
socket.on('your id', data =>{
	id = data
})
socket.on('loginSuccess', ()=>{
	document.getElementById('login').classList.add('loggedIn')
})
socket.on('createAccountSuccess', ()=>{
	alert('Account created successfully');
	document.getElementById('login').classList.add('loggedIn')
})
socket.on('loginFail', ()=>{
	alert('Username or password incorrect')
})
socket.on('createAccountFail', ()=>{
	alert('Username already exists')
})
socket.on('accountError', (error)=>{
	alert('Error: ' + error.toString())
})

socket.on('disconnect', ()=>{
	document.write('<h1>You\'ve disconnected.</h1>')
})
socket.on('stats', (data)=>{

	document.getElementById('stats').style.display = 'block';
	document.getElementById('home').classList.add('blurred');

	var statsDiv = document.querySelector('#stats>.content')
	statsDiv.innerHTML = ''

	// loop through data
	for (var key in data) {
		statsDiv.innerHTML += '<p>' + statsDescription[key] + ': ' + data[key].toString() + '</p>'
	}
})
// 0 .3 .6 1

function linearInterpolation(a, b, amount){
	return a + ((b-a) * amount)
}
function lerpGamestate(gameState1, gameState2, amount){
	if (gameState1 && gameState2) {
		return lerpObject(gameState1, gameState2, amount)
	} 
}
function lerpObject(object1, object2, amount) {
	var newObject = {};
	if (object2.noLerp) {
		return object2;
	} else {
		for (var key in object1) {
			if (!isNaN(object1[key])) {
				newObject[key] = linearInterpolation(object1[key], object2[key], amount)
			} else {
				newObject[key] = lerpObject(object1[key], object2[key], amount)
			}
		}
	}
	return newObject;
}
images = {}
sounds = {}
function setup(){
	rectMode(CENTER);
	ellipseMode(RADIUS);
	angleMode(RADIANS); 
	imageMode(CENTER);
	textAlign(CENTER)
	createCanvas(window.innerWidth,window.innerHeight);
	images.redTotemGrey.filter(GRAY);
	images.blueTotemGrey.filter(GRAY);
}
function preload(){
	images.background = loadImage('client/media/background.png');
	images.player = loadImage('client/media/player.png');
	images.redTotem = loadImage('client/media/redTotem.png');
	images.blueTotem = loadImage('client/media/blueTotem.png');
	images.redTotemGrey = loadImage('client/media/redTotem.png');
	images.blueTotemGrey = loadImage('client/media/blueTotem.png');
	images.platform = loadImage('client/media/platform.png')
	// sounds.ground = loadSound('client/media/ground.mp3')
	// sounds.badBase = loadSound('client/media/badBase.mp3')
	// sounds.goodBase = loadSound('client/media/goodBase.mp3')
}
class Particle {
	constructor(color, startpos, radius=5, degrade=0.1, move=[0, 2]){
		this.color = color
		this.maxRadius = radius
		this.radius = 1
		this.degrade = degrade
		this.move = move
		this.pos = startpos
	}
	update(){
		if (this.radius >= this.maxRadius) {
			this.radius -= this.degrade
			this.maxRadius = this.radius
		} else {
			this.radius += 0.2
		}
		this.pos = [this.pos[0] + this.move[0], this.pos[1] + this.move[1]]
	}
	draw(){
		noStroke()
		fill(...this.color)
		ellipse(this.pos[0], this.pos[1], this.radius, this.radius)
	}
}
particles = []
playerChanges = {};
var lerpSpeed = 0.6
function draw(){
	try{
	if (inEnd) {
		lerpSpeed *= 0.98
	}
	prevTime = new Date().getTime()
	// reset background
	currentState = lerpGamestate(gameStates[0], gameStates[1], lerpFrame)
	// currentState = gameStates[1]
	lerpFrame += lerpSpeed
	data = currentState;
	if (data != null) {
		if(id){
			background(0)
			image(images.background, 
				width/2 - data.players[id].camera.x * 0.2, 
				height/2 - data.players[id].camera.y * 0.2, 
				2500, 1000)
			push()
			translate(-data.players[id].camera.x + width/2, -data.players[id].camera.y + height/2)
			for (var i in data.platforms) {
				platform = data.platforms[i]
				noStroke()
				fill(...Object.values(platform.color))
				if (platform.type == 0) {
					rect(platform.x, platform.y, platform.width, platform.height, 10)
				} else if (platform.type == 1) {
					rect(platform.x, platform.y, platform.width * 1.2, platform.height, (platform.width + platform.height) / 2)
					ellipse(platform.x, platform.y - platform.height/2, platform.width/3, platform.width/6)
					ellipse(platform.x, platform.y + platform.height/2, platform.width/3, platform.width/6)
					fill(...Object.values(platform.color), 100)
					ellipse(platform.x, platform.y, platform.width * 0.7, platform.height * 0.9)
				} else if (platform.type == 3) {
					rect(platform.x, platform.y, platform.width, platform.height, 0)
				}
				if (platform.type == 0) {
					var imageSize = 50;
					if (platform.width < imageSize * 2) {
						imageSize = platform.width/2
					}
					if (platform.height < imageSize * 2) {
						imageSize = platform.height/2
					}
					// top two corners
					image(
						images.platform, platform.x-platform.width/2+imageSize/2, platform.y-platform.height/2+imageSize/2, imageSize, imageSize, 
						0, 0, 200, 200
					)
					image(
						images.platform, platform.x+platform.width/2-imageSize/2, platform.y-platform.height/2+imageSize/2, imageSize, imageSize, 
						400, 0, 200, 200
					)
					// bottom two corners
					image(
						images.platform, platform.x-platform.width/2+imageSize/2, platform.y+platform.height/2-imageSize/2, imageSize, imageSize, 
						0, 400, 200, 200
					)
					image(
						images.platform, platform.x+platform.width/2-imageSize/2, platform.y+platform.height/2-imageSize/2, imageSize, imageSize, 
						400, 400, 200, 200
					)
					// left and right edges
					if (platform.height-imageSize*2 > 0) {
						image(
							images.platform, platform.x-platform.width/2+imageSize/2, platform.y, imageSize, platform.height-imageSize*2, 
							0, 200, 200, 200
						)
						image(
							images.platform, platform.x+platform.width/2-imageSize/2, platform.y, imageSize, platform.height-imageSize*2, 
							400, 200, 200, 200
						)
					}
					if (platform.width-imageSize*2 > 0) {
						image(
							images.platform, platform.x, platform.y-platform.height/2+imageSize/2, platform.width-imageSize*2, imageSize, 
							200, 0, 200, 200
						)
						image(
							images.platform, platform.x, platform.y+platform.height/2-imageSize/2, platform.width-imageSize*2, imageSize, 
							200, 400, 200, 200
						)
					}
					fill(...Object.values(platform.color), 75)
					rect(platform.x, platform.y, platform.width, platform.height, imageSize/5)
				}
				// le trunk
				if (platform.type == 3) {
					image(
						images.platform, platform.x-platform.width/2 + 18, platform.y, imageSize, platform.height, 
						0, 200, 200, 200
					)
					image(
						images.platform, platform.x+platform.width/2 - 18, platform.y, imageSize, platform.height, 
						400, 200, 200, 200
					)
					fill(...Object.values(platform.color), 150)
					rect(platform.x, platform.y, platform.width, platform.height, imageSize/5, 0)
					fill(255, 255, 255, 50)
					for (var i = 0; i < Math.round(platform.height/platform.width) + 1; i++) {
						circle(platform.x, ((platform.y + platform.height/2) - i * platform.width) - platform.width/2, platform.width * 0.35)
					}
					fill(255, 255, 255, 50)
					for (var i = 1; i < Math.round(platform.height/platform.width) + 1; i++) {
						circle(platform.x, ((platform.y + platform.height/2) - i * platform.width), platform.width * 0.25)
					}

				}
		}
		for (var i in data.flags) {
			var img;
			var flag = data.flags[i]
			var partiColor;
			if (flag.side == 0) {
				if (flag.invul) {
					img = images.redTotemGrey
				} else {
					img = images.redTotem
				}
				fill(255, 0, 0, 120)
				partiColor = [255, 0, 0, 100]
			} else {
				if (flag.invul) {
					img = images.blueTotemGrey
				} else {
					img = images.blueTotem
				}
				fill(0, 0, 255, 120)
				partiColor = [0, 0, 255, 100]
			}
			// check which base it's in
			var circleWidth = 0;
			homeBase = Object.values(data.bases).filter(el=>{return el.side==flag.side})[0]
			// if in this base
			if ((homeBase.x - flag.x) ** 2 + (homeBase.y - flag.y) ** 2 < homeBase.radius**2){
				// if in own base
				circleWidth = 1
				// make particles
				if (Math.random() > 0.9) {
					particles.push(new Particle(partiColor, [flag.x + Math.random() * 40 - 20, flag.y + Math.random() * 40 - 20], 7, 0.05, [Math.random()*2 - 1, Math.random()*2 - 1]))
				}
			// else if somewhere else
			} else {
				// make particles pointing in that direction
				if (Math.random() > 0.9) {
					particles.push(new Particle(partiColor, [flag.x + Math.random() * 40 - 20, flag.y + Math.random() * 40 - 20], 7, 0.05, 
						[(homeBase.x - flag.x) * 0.005, (homeBase.y - flag.y) * 0.005]
					))
				}
			}
			if (flag.hold) {
				ellipse(flag.x, flag.y - 30, flag.width/3.1 + circleWidth, flag.height/2.2 + circleWidth)
				image(img, flag.x, flag.y - 30, flag.width, flag.height);
			} else {
				ellipse(flag.x, flag.y, flag.width/3.1 + circleWidth, flag.height/2.2 + circleWidth)
				image(img, flag.x, flag.y, flag.width, flag.height);
			}
		}
		textSize(20)
		document.getElementById('effectsList').innerHTML = ''
		for (var i in data.players) {
			var player = data.players[i]
			if (player.username.username) {
				fill(255, 255, 255)
				text(player.username.username, player.x, player.y - player.radius - 10)
			}
			
			if (player.effects[0]) {
				var radius = (Object.values(player.effects).length) * 0.2
				for (var j in player.effects) {
					if (j != 'noLerp') {
						if (Math.random() > 0.8) {
							particles.push(new Particle(effectColors[player.effects[j].type], [player.x + Math.random() * 40 - 20, player.y + Math.random() * 40 - 20], 7, 0.2, 
								[0, -2]
							))
						}
						radius -= 0.2
						strokeWeight(5)
						stroke(...effectColors[player.effects[j].type])
						arc(player.x, player.y, player.radius + player.radius * radius, player.radius + player.radius * radius, 0, 2 * Math.PI * player.effects[j].duration)
						// show in UI
						if (id == i) {
							// check if it already exists
							var newLi = true;
							for (var li of document.getElementById('effectsList').children){
								var title = li.querySelector('h3')
								if (title.textContent.startsWith(player.effects[j].type)) {
									newLi = false
									if (isNaN(title.textContent.split(' ').slice(-1)[0])){
										title.textContent += ' 2'
									} else {
										var split = title.textContent.split(' ')
										split[1] = (Number(split[1]) + 1).toString()
										li.querySelector('h3').textContent = split.join(' ')
									}
								}
							}
							if (newLi){
								document.getElementById('effectsList').innerHTML += `
								<li>
								<h3 style='color:rgb(`+ effectColors[player.effects[j].type].join(',') +`)'>` + player.effects[j].type + `</h3>
								<p>` + effectDescription[player.effects[j].type] + `</p>
								</li>`
							}
						}
					}
				}

			}
			var inBase = false;
			strokeWeight(4);
			for (var j in data.bases) {
				var base = data.bases[j]
				// if in this base
				if ((base.x - player.x) ** 2 + (base.y - player.y) ** 2 < base.radius**2){
					inBase = true;
					// if in own base
					if (base.side == player.team) {
						strokeWeight(8)
						// make particles feeding into player
						if (Math.random() > 0.95) {
							particles.push(new Particle(Object.values(player.color), [base.x + Math.random() * 40 - 20, base.y + Math.random() * 40 - 20], 7, 0.2, 
								[(player.x - base.x) * 0.015, (player.y - base.y) * 0.015]
							))
						}
						// if (!sounds.goodBase.isPlaying()) {
						// 	sounds.goodBase.play()
						// }
					// else if in other persons
					} else {
						strokeWeight(Math.random() * 8)
						// make particles feeding from player
						if (Math.random() > 0.5) {
							particles.push(new Particle(Object.values(player.color), [player.x + Math.random() * 40 - 20, player.y + Math.random() * 40 - 20], 7, 0.2, 
								[(player.x - base.x) * 0.015, (player.y - base.y) * 0.015]
							))
						}
						// if (!sounds.badBase.isPlaying()) {
						// 	sounds.badBase.play()
						// }
					}
				}
			}
			if (player.y > 1000) {
				strokeWeight(Math.random() * (5 + 0.01 * (player.y - 1000)))
				if (Math.random() > 0.5) {
					particles.push(new Particle(Object.values(player.color), [player.x + Math.random() * 40 - 20, player.y + Math.random() * 40 - 20], 7, 0.2, 
						[-6 + Math.random() * 12, 10 + (player.y - 1000) * 0.005]
					))
				}
			}
			if (!inBase) {
				// if (sounds.goodBase.isPlaying()) {
				// 	sounds.goodBase.stop()
				// }
				// if (sounds.badBase.isPlaying()) {
				// 	sounds.badBase.stop()
				// }
			}
			if (player.team == 0) {
				stroke(255, 0, 0, 100)
			} else {
				stroke(0, 0, 255, 100)
			}
			fill(player.color[0], player.color[1], player.color[2])
			ellipse(player.x, player.y, player.radius, player.radius)
			image(images.player, player.x, player.y, player.radius * 2, player.radius * 2);
			// health bar
			noStroke()
			if (player.health < 100) {
				if (player.team == 0) {
					fill(255, 0, 0, 100)
				} else {
					fill(0, 0, 255, 100)
				}
				rect(player.x, player.y - player.radius * 1.5, player.radius * 2, 0.5 * player.radius, 0.5 * player.radius)
				// set color based on health
				if (player.health < 20) {
					fill(255, 0, 0)
				} else if (player.health < 40) {
					fill(255, 150, 0)
				} else if (player.health < 70) {
					fill(255, 255, 0)
				} else {
					fill(0, 255, 0)
				}
				rect(player.x - player.radius + (player.radius * player.health/50)/2, player.y - player.radius * 1.5, player.radius * player.health/50, 0.5 * player.radius, 0.5 * player.radius)
			}
			if (player.invul % 8 > 3) {
				fill(255, 0, 0, 120)
				ellipse(player.x, player.y, player.radius, player.radius)
			}
			// check if want to creat ground particles
			if (!(i in playerChanges)) {
				playerChanges[i] = {onGround: false}
			}
			var lastGround = playerChanges[i].onGround;
			onGround = false;
			var platform, platformCorners, pos, platformColor;
			for (var l in data.platforms) {
				platform  = data.platforms[l]
				platformCorners = [
					{x: player.x + player.radius, y: player.y + player.radius},
					{x: player.x - player.radius, y: player.y + player.radius},
					{x: player.x + player.radius, y: player.y - player.radius},
					{x: player.x - player.radius, y: player.y - player.radius}
				]
				for (var j in platformCorners) {
					pos = platformCorners[j]
					if (pos.x >= platform.x-platform.width/2 && pos.x <= platform.x+platform.width/2 && pos.y >= platform.y-platform.height/2 && pos.y <= platform.y+platform.height/2) {
						onGround = true
						platformColor = Object.values(platform.color)
					}
				}
			}
			if (lastGround != onGround && onGround) {
				for (var j = 0; j < Math.random() * 5; j++) {
					particles.push(new Particle(platformColor, [player.x + Math.random() * 40 - 20, player.y + Math.random() * 40 - 20]))
				}
				// sounds.ground.play()
			}
			playerChanges[i].onGround = onGround;
		}

		for (var i in data.bases) {
			noStroke()
			if (data.bases[i].side == 0){
				fill(255, 0, 0, 50)
			} else {
				fill(0, 0, 255, 50)
			}
			ellipse(data.bases[i].x, data.bases[i].y, data.bases[i].radius, data.bases[i].radius)
			ellipse(data.bases[i].x, data.bases[i].y, data.bases[i].radius/2, data.bases[i].radius/2)
			ellipse(data.bases[i].x, data.bases[i].y, data.bases[i].radius/4, data.bases[i].radius/4)
		}
		if (data.powers != 0) {
			for (var i in data.powers) {
				var power = data.powers[i]
				noStroke()
				fill(...Object.values(power.color), 50)
				ellipse(power.x, power.y, power.width * 2, power.height * 2)
				fill(...Object.values(power.color), 100)
				ellipse(power.x, power.y, power.width, power.height)
				fill(...Object.values(power.color))
				ellipse(power.x, power.y, power.width/2, power.height/2)
				fill(255, 255, 255, 50)
				ellipse(power.x, power.y, power.width/3, power.height/3)
				fill(255, 255, 255, 150)
				circle(power.x, power.y, power.width/6 * Math.random() + 2)
				if (Math.random() > 0.95) {
					particles.push(new Particle(Object.values(power.color), [power.x + Math.random() * power.width - power.width/2, power.y + Math.random() * power.width - power.width/2], 7, 0.2, 
						[Math.random() * 0.5 - 0.25, -1]
					))
				}
			}
		}
		for (var i in particles) {
			particles[i].draw()
			particles[i].update()
		}
		particles = particles.filter(el=>{return el.radius > 1})
		pop()
		}
	}
	} catch(e) {
		console.log(e.message)
	}
}

var input = {
	up: false,
	down: false,
	left: false,
	right: false
}

document.addEventListener('keydown', event => {
	switch (event.key.toLowerCase()) {
		case 'w':
			input.up = true;
			break;
		case 's':
			input.down = true;
			break;
		case 'a':
			input.left = true;
			break;
		case 'd':
			input.right = true;
			break
		case 'e':
			input.throw = true;
			break
	}
})

document.addEventListener('keyup', event => {
	switch (event.key.toLowerCase()) {
		case 'w':
			input.up = false;
			break;
		case 's':
			input.down = false;
			break;
		case 'a':
			input.left = false;
			break;
		case 'd':
			input.right = false;
			break
		case 'e':
			input.throw = false;
			break
	}
})

setInterval(function(){
	if (inGame) {
		socket.emit('input', input)
	}
}, 1000/60)
document.getElementById('play').onclick = function(){
	socket.emit('new player')
	inGame = true;
	document.getElementById('home').style.display = 'none'
	document.getElementById('gui').style.display = 'block'
}
document.getElementById('submitLogin').onclick = function(){
	var username = document.getElementById('username').value;
	var password = document.getElementById('password').value;
	socket.emit('login',{username:username, password:password})
}
document.getElementById('submitAccount').onclick = function(){
	var username = document.getElementById('username').value;
	var password = document.getElementById('password').value;
	socket.emit('createAccount', {username:username, password:password})
}
document.getElementById('logOut').onclick = function(){
	document.getElementById('login').classList.remove('loggedIn')
	document.getElementById('username').value = '';
	document.getElementById('password').value = '';
	socket.emit('logged out')
}
document.getElementById('showStats').onclick = function(){
	socket.emit('stats request')
}
document.querySelector('#stats>.close').onclick = function(){
	document.getElementById('stats').style.display = 'none';
	document.getElementById('home').classList.remove('blurred');
}

document.getElementById('back').onclick = function(){
	if (confirm('Are you sure you want to leave the game?')) {
		document.getElementById('home').style.display = 'block'
		document.getElementById('gui').style.display = 'none'
		inLobby = false;
		inGame = false;
		inEnd = false;

		gameStates = [null, null];
		currentState = null
		lerpFrame = 0;
		data = null

		particles = []
		playerChanges = {};
		lerpSpeed = 0.6

		input = {
			up: false,
			down: false,
			left: false,
			right: false
		}

		score = {red: 0, blue: 0}
		socket.emit('player left')
	}
	
}
