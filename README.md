# Source Code for JumpJumpJumpJump

JumpJumpJumpJump is a next-gen, holistic and blazingly fast game written in pure JavaScript (what is Typescript). The goal: bring the enemy statue back to your side. 

# Game Instructions

Press `w` to jump, hold `a` and `d` to move right and left, and hold `s` to fall down faster. To damage other players, jump on them - the faster you fall, the more damage you do. On your way to the other team's side, you can gather powerups that give you special abilites, like faster movement and higher jumps. Every time you bring the enemy totem back, your team scores a point - the first team to 3 wins.

This game is multiplayer - if the massive playerbase isn't currently online, try opening multiple tabs. The game only starts at 4 players, with 2 teams of 2. Good luck, and make sure to jump jump jump jump!

# Code

The client side is written in pure JavaScript, using [p5.js](https://p5js.org/) to render graphics, and [socket.io](https://socket.io/) to communicate with the server. The server is written in node.js, using a [MongoDB](https://www.mongodb.com/) database for user data.
