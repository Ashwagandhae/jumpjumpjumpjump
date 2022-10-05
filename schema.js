const mongoose = require('mongoose');

var user = new mongoose.Schema(
	{
		username:{type:String},
		password:{type:String},
		joinDate:{type:Date, default:Date.now},

		goalCount:{type:Number, default:0},
		killCount:{type:Number, default:0},
		gameCount:{type:Number, default:0}
	},
	{collection: 'users'},
);

var model = mongoose.model('user', user)

module.exports = model