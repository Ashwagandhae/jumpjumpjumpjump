const express = require('express');
const http = require('http');
const path = require('path');
const socketIO = require('socket.io');
const secrets = require('secrets.json');
var app = express();
var server = http.Server(app);
port = process.env.PORT || 1000;
var io = socketIO(server);
app.set('port', port);

const mongoose = require('mongoose');
const model = require('./schema.js');

const statsKeys = [
  'username',
  'joinDate',
  'goalCount',
  'killCount',
  'gameCount',
];

mongoose.connect(secrets.mongoUrl, { useNewUrlParser: true });
const connect = mongoose.connection;

app.use('/client', express.static(__dirname + '/client'));
app.get('/', function (request, response) {
  response.sendFile(path.join(__dirname + '/client', 'index.html'));
});
server.listen(port, () => {
  console.log('Starting server at 5001 port');
});

function argMax(arr) {
  return arr.map((x, i) => [x, i]).reduce((r, a) => (a[0] > r[0] ? a : r))[1];
}

var deltaTime = 3;

class Vector {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }
  add(otherVector) {
    return new Vector(this.x + otherVector.x, this.y + otherVector.y);
  }
  multiply(scale) {
    return new Vector(this.x * scale, this.y * scale);
  }
  dot(otherVector) {
    return this.x * otherVector.x + this.y * otherVector.y;
  }
  getAngle() {
    return Math.atan(-this.y / this.x);
  }
  getSquaredMagnitude() {
    return this.x * this.x + this.y * this.y;
  }
  normalize() {
    var dist = Math.sqrt(this.getSquaredMagnitude());
    return new Vector(this.x / dist, this.y / dist);
  }
}

function fromAngle(angle) {
  return new Vector(Math.cos(angle), Math.sin(angle));
}

var AIRFRICTION = 0.05;

class Player {
  constructor(id, base) {
    this.id = id;
    this.username = usernames[this.id];
    this.base = base;

    this.pos = new Vector(this.base.pos.x, this.base.pos.y);
    this.vel = new Vector(0, 0);
    this.accel = new Vector(0, 0);
    this.input = [];
    this.effects = [];
    this.lastPlayerContact = { playerId: null, timer: 0 };

    this.color = [
      Math.random() * 255,
      Math.random() * 255,
      Math.random() * 255,
    ];
    this.radius = 20;
    this.collider = new BoxCollider(
      this,
      0,
      0,
      this.radius * 2,
      this.radius * 2
    );
    this.onGround = false;
    this.onWall = false;
    this.standingPlatform = null;

    this.team = this.base.side;

    this.friction = 0.8;
    this.bounce = 0.3;
    this.health = 100;
    this.invul = 0;
    this.camera = new Vector(this.pos.x, this.pos.y);
    this.hold;
  }
  inBase(base) {
    var sqDistance = this.pos.add(base.pos.multiply(-1)).getSquaredMagnitude();
    if (sqDistance > (this.collider.size.x / 2 + base.radius) ** 2) {
      return false;
    }
    return true;
  }
  physicsUpdate() {
    // camera
    this.camera = this.camera.add(
      this.pos.add(this.camera.multiply(-1)).multiply(0.1)
    );
    // gravity
    this.accel.x = 0;
    this.accel.y = 1;
    // anti gravity with fall effect
    for (var effect of this.effects) {
      if (effect.type == 'feather') {
        this.accel.y *= 0.5;
      }
      if (effect.type == 'wellness') {
        this.health += 0.5;
      }
    }

    this.vel = this.vel.add(this.accel.multiply(deltaTime));
    // slowly move backward if holding totem
    if (this.hold) {
      this.vel = this.vel.add(
        new Vector(
          (this.hold.base.pos.x - this.pos.x) * 0.0002,
          (this.hold.base.pos.y - this.pos.y) * 0.0002
        )
      );
    }
    this.vel = this.vel.add(this.vel.multiply(-AIRFRICTION * deltaTime));
    this.pos = this.pos.add(this.vel.multiply(deltaTime));

    if (this.standingPlatform) {
      this.pos = this.pos.add(this.standingPlatform.vel.multiply(deltaTime));
    }

    this.onGround = false;
    this.standingPlatform = null;
    this.onWall = false;
    // lose health if falling into void
    if (this.pos.y > 1000) {
      this.health -= 1;
      // unless you have void powerup
      for (var effect of this.effects) {
        if (effect.type == 'popcorn') {
          this.pos.y -= effect.strength * 800;
          this.vel.y = -effect.strength * 20;
        }
      }
    }
    // do effects
    this.effects = this.effects.filter(function (effect) {
      effect.update();
      return effect.duration > 0;
    });
  }
  takeInput() {
    if (this.input.left) {
      this.vel.x -= 1 * deltaTime;
      for (var effect of this.effects) {
        if (effect.type == 'hotfoot') {
          this.vel.x -= effect.strength * deltaTime;
        }
      }
    }
    if (this.input.right) {
      this.vel.x += 1 * deltaTime;
      for (var effect of this.effects) {
        if (effect.type == 'hotfoot') {
          this.vel.x += effect.strength * deltaTime;
        }
      }
    }
    if (this.input.up && this.onGround) {
      this.vel.y = -25;
      for (var effect of this.effects) {
        if (effect.type == 'toad') {
          this.vel.y -= effect.strength * 10 * deltaTime;
        }
      }
    } else if (this.input.up && this.onWall) {
      this.vel.y = -25;
      for (var effect of this.effects) {
        if (effect.type == 'toad') {
          this.vel.y -= effect.strength * 10 * deltaTime;
        }
      }
      if (this.vel.x > 0) {
        this.vel.x += 3 * deltaTime;
      } else {
        this.vel.x -= 3 * deltaTime;
      }
    }
    if (this.input.down) {
      this.vel.y += 1 * deltaTime;
    }
    // throwing key
    if (this.input.throw && this.hold) {
      this.hold.vel = this.vel.multiply(4);
      this.hold.hold = null;
      this.hold.invul = 40;
      this.hold = null;
    }
  }
  export() {
    return {
      username: { username: this.username, noLerp: true },
      x: this.pos.x,
      y: this.pos.y,
      color: this.color,
      radius: this.radius,
      invul: this.invul,
      camera: this.camera,
      health: this.health,
      team: this.team,
      effects: {
        ...this.effects.map((effect) => {
          return {
            type: effect.type,
            duration: effect.duration / effect.maxDuration,
          };
        }),
        noLerp: true,
      },
      lobby: this.lobby,
    };
  }
  respawn() {
    this.pos = new Vector(this.base.pos.x, this.base.pos.y);
    this.vel = new Vector(0, 0);
    this.accel = new Vector(0, 0);
    this.onGround = false;
    this.standingPlatform = null;
    this.onWall = false;

    this.health = 100;
    this.invul = 0;
    this.camera = new Vector(this.pos.x, this.pos.y);
    this.hold = null;
    this.effects = [];
  }
}

class Platform {
  constructor(x, y, width, height, movePoints = [], color, type = 0) {
    this.pos = new Vector(x, y);
    this.size = new Vector(width, height);
    this.collider = new BoxCollider(this, 0, 0, width, height, 0);
    this.vel = new Vector(0, 0);
    if (color) {
      this.color = color;
    } else {
      this.color = [
        Math.random() * 255,
        Math.random() * 255,
        Math.random() * 255,
      ];
    }
    if (movePoints.length > 0) {
      this.movePoints = movePoints;
      this.currentPointIndex = 0;
    }
    this.type = type;
  }
  physicsUpdate() {
    if (this.movePoints) {
      var currentPoint = this.movePoints[this.currentPointIndex];
      this.vel = currentPoint
        .add(this.pos.multiply(-1))
        .normalize()
        .multiply(2);
      this.pos = this.pos.add(this.vel.multiply(deltaTime));
      if (this.pos.add(currentPoint.multiply(-1)).getSquaredMagnitude() < 4) {
        this.currentPointIndex += 1;
        if (this.currentPointIndex >= this.movePoints.length) {
          this.currentPointIndex = 0;
        }
      }
    }
  }
  export() {
    return {
      x: this.pos.x,
      y: this.pos.y,
      width: this.size.x,
      height: this.size.y,
      direction: this.collider.direction,
      color: this.color,
      type: this.type,
    };
  }
}
class BoxCollider {
  constructor(parent, offsetX, offsetY, width, height, direction) {
    this.parent = parent;
    this.offset = new Vector(offsetX, offsetY);
    this.size = new Vector(width, height);
    this.direction = direction;
    this.normal = fromAngle(this.direction + Math.PI / 2);
    this.angle = new Vector(this.size.x / 2, -this.size.y / 2).getAngle();
    this.friction = 0.1;
    this.bounce = 0.8;
  }
  pointInside(pos) {
    if (
      pos.x >= this.parent.pos.x - this.size.x / 2 &&
      pos.x <= this.parent.pos.x + this.size.x / 2 &&
      pos.y >= this.parent.pos.y - this.size.y / 2 &&
      pos.y <= this.parent.pos.y + this.size.y / 2
    ) {
      return true;
    }
  }
  corners() {
    return [
      this.parent.pos.add(new Vector(-this.size.x / 2, -this.size.y / 2)),
      this.parent.pos.add(new Vector(this.size.x / 2, -this.size.y / 2)),
      this.parent.pos.add(new Vector(-this.size.x / 2, this.size.y / 2)),
      this.parent.pos.add(new Vector(this.size.x / 2, this.size.y / 2)),
    ];
  }
  isCollideBox(box) {
    // check if this corners are in box
    let corners = this.corners();
    for (var i in corners) {
      if (box.pointInside(corners[i])) {
        corners[i] = 1;
      } else corners[i] = 0;
    }
    // check if box corners are in this
    corners = box.corners();
    for (var i in corners) {
      if (this.pointInside(corners[i])) {
        corners[i] = 1;
      } else corners[i] = 0;
    }
    return corners;
  }
  collideBox(box) {
    var hit = this.isCollideBox(box);
    var trace = hit.reduce((a, b) => a + b, 0);
    if (trace == 0) {
      return;
    } else if (trace > 1) {
      let angle = box.parent.pos.add(this.parent.pos.multiply(-1)).getAngle();
      // if on left side
      if (box.parent.pos.x < this.parent.pos.x) {
        angle += Math.PI;
      }
      if (angle < Math.PI - this.angle && angle > this.angle) {
        return 'top';
      } else if (angle < this.angle && angle > -this.angle) {
        return 'right';
      } else if (angle < Math.PI + this.angle && angle > Math.PI - this.angle) {
        return 'left';
      } else {
        return 'bottom';
      }
    } else if (trace == 1) {
      let angle = box
        .corners()
        [argMax(hit)].add(this.parent.pos.multiply(-1))
        .getAngle();
      if (box.parent.pos.x < this.parent.pos.x) {
        angle += Math.PI;
      }
      if (angle < Math.PI - this.angle && angle > this.angle) {
        return 'top';
      } else if (angle < this.angle && angle > -this.angle) {
        return 'right';
      } else if (angle < Math.PI + this.angle && angle > Math.PI - this.angle) {
        return 'left';
      } else {
        return 'bottom';
      }
    }
  }
}
class Flag {
  constructor(base, badBase, platforms) {
    this.base = base;
    this.badBase = badBase;
    this.pos = new Vector(this.base.pos.x, this.base.pos.y);
    this.vel = new Vector(0, 0);
    if (this.base.side == 0) {
      this.color = [255, 0, 0];
    } else {
      this.color = [0, 0, 255];
    }
    this.accel = new Vector(0, 0);
    this.hold;
    this.size = new Vector(50, 50);
    this.collider = new BoxCollider(this, 0, 0, this.size.x, this.size.y, null);
    this.invul = 0;
    this.noLerp = false;
    this.platforms = platforms;
  }
  physicsUpdate() {
    this.noLerp = false;
    if (this.hold) {
      this.pos = new Vector(this.hold.pos.x, this.hold.pos.y);
    } else {
      if (this.inBase(this.base) && !this.hold) {
        this.accel = this.base.pos.add(this.pos.multiply(-1)).multiply(0.01);
      } else {
        this.accel = new Vector(0, 1);
      }
      this.vel = this.vel.add(this.accel.multiply(deltaTime));
      this.vel = this.vel.add(this.vel.multiply(-AIRFRICTION * deltaTime));
      this.pos = this.pos.add(this.vel.multiply(deltaTime));
    }
    // jump up if falling into void
    if (this.pos.y > 1000) {
      if (this.hold) {
        this.hold.hold = null;
        this.hold = null;
      }
      var flagX = this.pos.x;
      var distances = this.platforms.map((p) => {
        return (p.pos.x - flagX) ** 2 * -1;
      });
      this.pos.x = this.platforms[argMax(distances)].pos.x;
      this.pos.y = -100;
      this.vel.y = 0;
      this.noLerp = true;
    }
    if (this.hold && this.hold.base == this.base && this.inBase(this.base)) {
      this.hold.hold = null;
      this.hold = null;
    } else if (
      this.hold &&
      this.hold.base == this.badBase &&
      this.inBase(this.badBase)
    ) {
      var scoreId = this.hold.id;
      model.findOneAndUpdate(
        { username: usernames[scorerId] },
        { $inc: { goalCount: 1 } },
        function (error, result) {
          if (error) {
            console.log(error);
          }
        }
      );
      this.hold.hold = null;
      this.hold = null;
      this.goHome();
      // score
      this.badBase.addScore();
    }
  }
  goHome() {
    this.noLerp = true;
    this.pos = new Vector(this.base.pos.x, this.base.pos.y);
    this.vel = new Vector(0, 0);
    this.invul = 40;
  }
  inBase(base) {
    var sqDistance = this.pos.add(base.pos.multiply(-1)).getSquaredMagnitude();
    if (sqDistance > (this.collider.size.x / 2 + base.radius) ** 2) {
      return false;
    }
    return true;
  }
  export() {
    return {
      x: this.pos.x,
      y: this.pos.y,
      side: this.base.side,
      width: this.size.x,
      height: this.size.y,
      invul: this.invul,
      noLerp: this.noLerp,
      hold: !!this.hold,
    };
  }
}
class Effect {
  constructor(type, duration, strength = 1) {
    this.type = type;
    this.maxDuration = duration;
    this.duration = duration;
    this.strength = strength;
  }
  update() {
    this.duration -= 1 * deltaTime;
  }
}
effectColors = {
  hotfoot: [0, 255, 0],
  toad: [0, 150, 255],
  popcorn: [255, 0, 255],
  feather: [255, 255, 0],
  ghost: [100, 100, 100],
  wellness: [255, 0, 0],
  cactus: [0, 100, 0],
  crowdsurf: [255, 150, 0],
  shirker: [150, 0, 255],
};
class Power {
  constructor(x, y, type) {
    this.pos = new Vector(x, y);
    this.vel = new Vector(0, 0);
    this.accel = new Vector(0, 0);
    this.size = new Vector(20, 20);
    this.collider = new BoxCollider(this, 0, 0, this.size.x, this.size.y, null);
    if (type) {
      this.effect = new Effect(type, 300, 1);
    } else {
      this.effect = new Effect(
        Object.keys(effectColors)[
          Math.floor(Math.random() * Object.keys(effectColors).length)
        ],
        300,
        1
      );
    }
    this.color = effectColors[this.effect.type];
    this.isPickedUp = false;
  }
  physicsUpdate() {
    // gravity
    this.accel.x = 0;
    this.accel.y = 1;
    this.vel = this.vel.add(this.accel.multiply(deltaTime));
    this.vel = this.vel.add(this.vel.multiply(-AIRFRICTION * deltaTime));
    this.pos = this.pos.add(this.vel.multiply(deltaTime));
  }
  export() {
    return {
      x: this.pos.x,
      y: this.pos.y,
      color: this.color,
      width: this.size.x,
      height: this.size.y,
    };
  }
}
class Base {
  constructor(side, pos, room) {
    this.side = side;
    this.radius = 200;
    this.pos = pos;
    this.score = 0;
    this.room = room;
  }
  export() {
    return {
      x: this.pos.x,
      y: this.pos.y,
      radius: this.radius,
      side: this.side,
    };
  }
  addScore() {
    this.score += 1;
    this.room.emitScore();
  }
}
class PowerGen {
  constructor(x, y, room) {
    this.pos = new Vector(x, y);
    this.room = room;
    this.power = new Power(this.pos.x, this.pos.y);
  }
  generatePower() {
    var that = this;
    setTimeout(function () {
      that.power = new Power(that.pos.x, that.pos.y);
    }, 10000);
  }
}
class Room {
  constructor(name) {
    this.players = {};
    this.name = name;
    this.maxSize = 4;
    this.generateTerrain();
    this.redBase = new Base(0, new Vector(-1700, 600), this);
    this.blueBase = new Base(1, new Vector(1700, 600), this);
    this.lobby = true;
    this.flags = [
      new Flag(this.redBase, this.blueBase, this.platforms),
      new Flag(this.blueBase, this.redBase, this.platforms),
    ];
    this.runningGame = true;
  }
  generateTerrain() {
    this.platforms = [];
    this.powers = [];

    // add base platforms
    this.platforms.push(new Platform(-1700, 700, 200, 50, [], [255, 0, 0]));

    this.platforms.push(new Platform(1700, 700, 200, 50, [], [0, 0, 255]));

    var floorSize = -800;
    var gap = 0,
      platformWidth = 0,
      stumpSize = 0;
    var leafSize = 70;
    while (floorSize < 180) {
      gap = 100 + Math.random() * 120;
      // sometimes add gap elevator
      if (Math.random() > 0.5) {
        this.pushPlatforms(floorSize + gap / 2, 700, gap, 70, [
          new Vector(floorSize + gap / 2, 650 - Math.random() * 500),
          new Vector(floorSize + gap / 2, 750 + Math.random() * 500),
        ]);
      }
      platformWidth = 200 + Math.random() * 120;
      this.pushPlatforms(
        floorSize + gap + platformWidth / 2,
        700,
        platformWidth,
        70
      );
      // sometimes add trees
      if (Math.random() > 0.5) {
        // stump
        stumpSize = 120 + Math.random() * 150;
        this.pushPlatforms(
          floorSize + gap + platformWidth / 2,
          665 - stumpSize / 2,
          70,
          stumpSize,
          [],
          [255 * Math.random(), 255 * Math.random(), 255 * Math.random()],
          3
        );
        // leaves
        var leafColor = [
          255 * Math.random(),
          255 * Math.random(),
          255 * Math.random(),
        ];
        this.pushPlatforms(
          floorSize + gap + platformWidth / 2,
          665 - stumpSize - leafSize * 0.5,
          150,
          leafSize,
          [],
          leafColor,
          1
        );
        // this.pushPlatforms(floorSize + gap + platformWidth/2, 665 - stumpSize - leafSize * 2.5, 150, leafSize, [], [20 + 30 * Math.random(), 100 + 50 * Math.random(), 20 * Math.random()])
        this.pushPlatforms(
          floorSize + gap + platformWidth / 2,
          665 - stumpSize - leafSize * 2.7,
          70,
          leafSize,
          [],
          leafColor,
          1
        );

        this.powers.push(
          new PowerGen(
            floorSize + gap + platformWidth / 2 - 800,
            665 - stumpSize - leafSize * 2.5,
            this
          )
        );
        this.powers.push(
          new PowerGen(
            1600 - (floorSize + gap + platformWidth / 2) - 800,
            665 - stumpSize - leafSize * 2.5,
            this
          )
        );
      }
      floorSize += gap + platformWidth;
    }
    // add middle platform
    gap = 100 + Math.random() * 40;
    platformWidth = 800 - floorSize - gap;
    this.pushPlatforms(
      floorSize + gap + platformWidth / 2,
      700,
      platformWidth,
      70
    );
    // always have power ups in the middle
    // stump
    stumpSize = 120 + Math.random() * 150;
    this.pushPlatforms(
      floorSize + gap + platformWidth / 2,
      665 - stumpSize / 2,
      70,
      stumpSize,
      [],
      [255 * Math.random(), 255 * Math.random(), 255 * Math.random()],
      3
    );
    // leaves
    var leafColor = [
      255 * Math.random(),
      255 * Math.random(),
      255 * Math.random(),
    ];
    this.pushPlatforms(
      floorSize + gap + platformWidth / 2,
      665 - stumpSize - leafSize * 0.5,
      150,
      leafSize,
      [],
      leafColor,
      1
    );
    // this.pushPlatforms(floorSize + gap + platformWidth/2, 665 - stumpSize - leafSize * 2.5, 150, leafSize, [], [20 + 30 * Math.random(), 100 + 50 * Math.random(), 20 * Math.random()])
    this.pushPlatforms(
      floorSize + gap + platformWidth / 2,
      665 - stumpSize - leafSize * 2.7,
      70,
      leafSize,
      [],
      leafColor,
      1
    );

    this.powers.push(
      new PowerGen(
        floorSize + gap + platformWidth / 2 - 800,
        665 - stumpSize - leafSize * 2.5,
        this
      )
    );
    this.powers.push(
      new PowerGen(
        1600 - (floorSize + gap + platformWidth / 2) - 800,
        665 - stumpSize - leafSize * 2.5,
        this
      )
    );

    // add the center supergen
    this.platforms.push(
      new Platform(0, -500, 120, 70, [
        new Vector(0, 665 - stumpSize - leafSize * 2.7 - 100),
        new Vector(0, -500),
      ])
    );
    this.platforms.push(new Platform(0, -600, 100, 100, [], undefined, 1));
    this.pushPlatforms(700, -750, 70, 100, [], undefined, 1);
    // make the powerup gens
    for (var i = -2; i < 3; i++) {
      this.powers.push(new PowerGen(i * 10, -750, this));
    }
  }
  pushPlatforms(x, y, width, height, movePoints = [], color, type = 0) {
    var movePointsRed = [];
    var movePointsBlue = [];
    if (!color) {
      var color = [
        Math.random() * 255,
        Math.random() * 255,
        Math.random() * 255,
      ];
    }
    if (movePoints.length > 0) {
      for (var p of movePoints) {
        movePointsRed.push(new Vector(p.x - 800, p.y));
        movePointsBlue.push(new Vector(1600 - p.x - 800, p.y));
      }
    }
    this.platforms.push(
      new Platform(x - 800, y, width, height, movePointsRed, color, type)
    );
    this.platforms.push(
      new Platform(
        1600 - x - 800,
        y,
        width,
        height,
        movePointsBlue,
        color,
        type
      )
    );
  }
  addPlayer(playerId) {
    // red is 0 blue is 1
    var red = 0;
    var blue = 0;
    for (var key in this.players) {
      if (this.players[key].team) {
        blue += 1;
      } else {
        red += 1;
      }
    }
    if (blue > red) {
      this.players[playerId] = new Player(playerId, this.redBase);
    } else {
      this.players[playerId] = new Player(playerId, this.blueBase);
    }
    if (Object.values(this.players).length == this.maxSize) {
      if (this.lobby) {
        this.lobby = false;
        this.redBase.score = 0;
        this.blueBase.score = 0;
        this.emitScore();
        for (var f of this.flags) {
          f.goHome();
        }
      } else {
        this.emitScore(true);
      }
    }
    this.emitLobby();
  }
  deletePlayer(playerId) {
    if (this.players[playerId].hold) {
      this.players[playerId].hold.hold = null;
      this.players[playerId].hold.vel = fromAngle(
        Math.PI / 4 + (Math.random() * Math.PI) / 2
      ).multiply(10);
    }
    delete this.players[playerId];
    this.emitLobby();
  }
  update() {
    // extreme op epic power mode
    // if (Math.random() > 0.9) {
    // 	this.genPowers()
    // }
    for (var platform of this.platforms) {
      platform.physicsUpdate();
    }
    for (var key in this.players) {
      if (this.players[key].lastPlayerContact.timer > 0) {
        this.players[key].lastPlayerContact.timer -= 1 * deltaTime;
        if (this.players[key].lastPlayerContact.timer < 0) {
          this.players[key].lastPlayerContact.timer = 0;
          this.players[key].lastPlayerContact.playerId = null;
        }
      }
      this.players[key].takeInput();
      this.players[key].physicsUpdate();
      if (this.players[key].invul > 0) {
        this.players[key].invul -= 1 * deltaTime;
      }
      // regen when in base
      if (this.players[key].inBase(this.redBase)) {
        if (this.redBase == this.players[key].base) {
          this.players[key].health += 0.2;
        } else {
          this.players[key].health -= 0.4;
        }
      }
      if (this.players[key].inBase(this.blueBase)) {
        if (this.blueBase == this.players[key].base) {
          this.players[key].health += 0.2;
        } else {
          this.players[key].health -= 0.4;
        }
      }
      if (this.players[key].health <= 0) {
        if (this.players[key].lastPlayerContact.playerId) {
          var killerId = this.players[key].lastPlayerContact.playerId;
          model.findOneAndUpdate(
            { username: usernames[killerId] },
            { $inc: { killCount: 1 } },
            function (error, result) {
              if (error) {
                console.log(error);
              }
            }
          );
        }
        this.players[key].respawn();
      } else if (this.players[key].health > 100) {
        this.players[key].health = 100;
      }
      this.handleCollisions(this.players[key]);
    }
    for (var i in this.flags) {
      this.flags[i].physicsUpdate();
      if (this.flags[i].invul > 0) {
        this.flags[i].invul -= 1;
      }
      if (!this.flags[i].hold) {
        this.flagCollisions(this.flags[i]);
      }
    }
    for (var powerGen of this.powers) {
      if (powerGen.power) {
        powerGen.power.physicsUpdate();
        this.powerCollisions(powerGen);
      }
    }
    this.powers.forEach((powerGen) => {
      if (powerGen.power && powerGen.power.isPickedUp) {
        powerGen.power = null;
      }
    });
  }
  emit() {
    var allPlayersObj = {};
    for (var key in this.players) {
      allPlayersObj[this.players[key].id] = this.players[key].export();
    }
    var platformsList = this.platforms.map((platform) => platform.export());
    io.sockets.to(this.name).emit('game state', {
      players: allPlayersObj,
      platforms: platformsList,
      flags: this.flags.map((flag) => flag.export()),
      bases: [this.redBase.export(), this.blueBase.export()],
      powers: this.powers
        .filter((powerGen) => {
          return powerGen.power;
        })
        .map((powerGen) => powerGen.power.export()),
    });
  }
  emitScore(rejoin = false) {
    if (!this.lobby) {
      io.sockets.to(this.name).emit('score update', {
        red: this.redBase.score,
        blue: this.blueBase.score,
        rejoin: rejoin,
      });
      if (this.redBase.score >= 3 || this.blueBase.score >= 3) {
        this.endGame();
      } else {
        // respawn all
        for (var key in this.players) {
          this.players[key].respawn();
        }
      }
    }
  }
  emitLobby() {
    io.sockets.to(this.name).emit('lobby', {
      inLobby: this.lobby,
      playerCount: Object.values(this.players).length,
      maxSize: this.maxSize,
    });
  }
  endGame() {
    io.sockets.to(this.name).emit('game over', {
      red: this.redBase.score,
      blue: this.blueBase.score,
    });
    this.runningGame = false;
  }
  handleCollide(collide, player, box) {
    if (collide) {
      if (collide == 'top') {
        // player.vel.y *= -box.collider.bounce
        player.vel.y = 0;
        player.pos.y =
          box.pos.y - box.collider.size.y / 2 - player.collider.size.y / 2;
        player.onGround = true;
        player.standingPlatform = box;
      } else if (collide == 'right') {
        // if not a ghost
        if (
          !player.effects ||
          player.effects.filter((f) => {
            return f.type == 'ghost';
          }) == 0
        ) {
          player.vel.x *= -box.collider.bounce;
          player.onWall = true;
          player.pos.x =
            box.pos.x + box.collider.size.x / 2 + player.collider.size.x / 2;
        }
      } else if (collide == 'left') {
        // if not a ghost
        if (
          !player.effects ||
          player.effects.filter((f) => {
            return f.type == 'ghost';
          }) == 0
        ) {
          player.vel.x *= -box.collider.bounce;
          player.onWall = true;
          player.pos.x =
            box.pos.x - box.collider.size.x / 2 - player.collider.size.x / 2;
        }
      } else if (collide == 'bottom') {
        // if not a ghost
        if (
          !player.effects ||
          player.effects.filter((f) => {
            return f.type == 'ghost';
          }) == 0
        ) {
          player.vel.y *= -box.collider.bounce;
          player.pos.y =
            box.pos.y + box.collider.size.y / 2 + player.collider.size.y / 2;
        }
      }
      player.vel = player.vel.add(
        player.vel.multiply(-box.collider.friction * deltaTime)
      );
    }
  }
  handlePlayerCollide(collide, player, player2) {
    if (collide) {
      if (player.vel.y > 0 && player.pos.y < player2.pos.y) {
        if (player.team != player2.team && player2.invul <= 0) {
          var ogHealth = player2.health;
          player2.health -= player.vel.y * 2;
          for (var effect of player.effects) {
            if (effect.type == 'cactus') {
              player2.health -= effect.strength * 20;
            }
          }
          player2.lastPlayerContact.playerId = player.id;
          player2.lastPlayerContact.timer = 160;
          player2.invul = 40;
          player.vel.y = -15;
          var direction = -1;
          if (Math.random() > 0.5) {
            direction = 1;
          }
          for (var effect of player2.effects) {
            if (effect.type == 'shirker') {
              if (Math.random() > 0.5) {
                player2.pos.x += effect.strength * 50 * direction;
              } else {
                player2.pos.x -= effect.strength * 50 * direction;
              }
              player2.health = ogHealth;
              player2.invul = 0;
              player.vel.y += 15;
            }
          }
          // sets flags hold
          if (player2.hold) {
            player2.hold.hold = null;
            player2.hold.vel = fromAngle(
              Math.PI / 4 + (Math.random() * Math.PI) / 2
            ).multiply(10);
            player2.hold.invul = 40;
            player2.hold = null;
          }
        } else {
          player.vel.y = -15;
        }
        for (var effect of player.effects) {
          if (effect.type == 'crowdsurf') {
            player.vel.y -= 20 * effect.strength;
          }
        }
      } else {
        if (player.pos.x < player2.pos.x) {
          player.vel.x -= 1;
        } else if (player.pos.x > player2.pos.x) {
          player.vel.x += 1;
        }
      }
    }
  }
  handleCollisions(player) {
    var platforms = this.platforms;
    var players = this.players;
    for (var i in platforms) {
      let collide = platforms[i].collider.collideBox(player.collider);
      this.handleCollide(collide, player, platforms[i]);
    }
    for (var key in players) {
      if (players[key] != player) {
        let collide = players[key].collider.collideBox(player.collider);
        this.handlePlayerCollide(collide, player, players[key]);
      }
    }
  }
  flagCollisions(flag) {
    var platforms = this.platforms;
    var players = this.players;
    for (var i in platforms) {
      let collide = platforms[i].collider.collideBox(flag.collider);
      this.handleCollide(collide, flag, platforms[i]);
    }
    if (!flag.invul) {
      for (var key in players) {
        let collide = players[key].collider.collideBox(flag.collider);
        if (
          collide &&
          !players[key].hold &&
          !(flag.inBase(flag.base) && flag.base == players[key].base)
        ) {
          flag.hold = players[key];
          players[key].hold = flag;
        }
      }
    }
  }
  powerCollisions(powerGen) {
    var power = powerGen.power;
    var platforms = this.platforms;
    var players = this.players;
    for (var i in platforms) {
      let collide = platforms[i].collider.collideBox(power.collider);
      this.handleCollide(collide, power, platforms[i]);
    }
    for (var key in players) {
      let collide = players[key].collider.collideBox(power.collider);
      if (collide) {
        players[key].effects.push(power.effect);
        power.isPickedUp = true;
        powerGen.generatePower();
      }
    }
  }
}

// players = {}
// platforms = [new Platform(200, 100, 200, 100), new Platform(400, 700, 1600, 100), new Platform(400, 400, 100, 300), new Platform(100, 500, 100, 300)]
// flags = [new Flag(200, 200, [255, 0, 0])]
rooms = [];
usernames = {};

io.on('connection', (socket) => {
  usernames[socket.id] = null;
  socket.emit('your id', socket.id);
  socket.on('login', (data) => {
    model.find(
      { username: data.username, password: data.password },
      function (error, results) {
        if (error) {
          socket.emit('accountError', error);
        } else if (results.length > 0) {
          usernames[socket.id] = data.username;
          socket.emit('loginSuccess');
        } else {
          socket.emit('loginFail');
        }
      }
    );
  });
  socket.on('createAccount', (data) => {
    model.find({ username: data.username }, function (error, results) {
      if (error) {
        socket.emit('accountError', error);
      } else if (results.length > 0) {
        socket.emit('createAccountFail');
      } else {
        model.create(data, function (error) {
          if (error) {
            socket.emit('accountError', error);
          } else {
            usernames[socket.id] = data.username;
            socket.emit('createAccountSuccess');
          }
        });
      }
    });
  });
  socket.on('new player', function () {
    if (rooms.length > 0) {
      for (var i in rooms) {
        if (Object.keys(rooms[i].players).length < rooms[i].maxSize) {
          var room = rooms[i];
          socket.join(room.name);
          room.addPlayer(socket.id);
          return;
        }
      }
      var room = new Room(rooms.length.toString());
      socket.join(room.name);
      room.addPlayer(socket.id);
      rooms.push(room);
    } else {
      var room = new Room(rooms.length.toString());
      socket.join(room.name);
      room.addPlayer(socket.id);
      rooms.push(room);
    }
    room.emitScore();
  });
  socket.on('input', (data) => {
    if (rooms[Number(Object.keys(socket.rooms)[0])]) {
      if (rooms[Number(Object.keys(socket.rooms)[0])].players[socket.id]) {
        rooms[Number(Object.keys(socket.rooms)[0])].players[socket.id].input =
          data;
      }
    }
  });
  socket.on('stats request', () => {
    model.find({ username: usernames[socket.id] }, function (error, results) {
      if (error) {
        console.log(error);
      } else {
        var stats = {};
        for (var key of statsKeys) {
          stats[key] = results[0][key];
        }
        socket.emit('stats', stats);
      }
    });
  });
  socket.on('logged out', () => {
    usernames[socket.id] = null;
  });
  socket.on('player left', () => {
    for (var room of rooms) {
      if (socket.id in room.players) {
        room.deletePlayer(socket.id);
      }
    }
  });
  socket.on('disconnect', () => {
    delete usernames[socket.id];
    for (var room of rooms) {
      if (socket.id in room.players) {
        room.deletePlayer(socket.id);
      }
    }
  });
});

prevTime = new Date().getTime();
currentTime = new Date().getTime();
setInterval(function () {
  prevTime = currentTime;
  currentTime = new Date().getTime();
  deltaTime = ((currentTime - prevTime) / 1000) * 30;
  for (var i in rooms) {
    rooms[i].update();
    rooms[i].emit();
  }
  rooms = rooms.filter((r) => {
    return r.runningGame;
  });
}, 1000 / 30);
