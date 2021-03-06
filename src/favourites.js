var async = require('async'),

	db = require('./database'),
	posts = require('./posts'),
	user = require('./user'),
	translator = require('./../public/src/translator');

(function (Favourites) {
	"use strict";

	Favourites.favourite = function (pid, room_id, uid, socket) {
		var	websockets = require('./socket.io');

		if (uid === 0) {

			translator.mget(['topic:favourites.not_logged_in.message', 'topic:favourites.not_logged_in.title'], function(err, results) {
				socket.emit('event:alert', {
					alert_id: 'post_favourite',
					title: results[1],
					message: results[0],
					type: 'danger',
					timeout: 5000
				});
			});
			return;
		}

		posts.getPostFields(pid, ['uid', 'timestamp'], function (err, postData) {

			Favourites.hasFavourited(pid, uid, function (err, hasFavourited) {

				if (!hasFavourited) {

					db.sortedSetAdd('uid:' + uid + ':favourites', postData.timestamp, pid);
					db.setAdd('pid:' + pid + ':users_favourited', uid, function(err) {
						db.setCount('pid:' + pid + ':users_favourited', function(err, count) {
							posts.setPostField(pid, 'reputation', count);
						});
					});


					if (uid !== postData.uid) {
						user.incrementUserFieldBy(postData.uid, 'reputation', 1, function (err, newreputation) {
							db.sortedSetAdd('users:reputation', newreputation, postData.uid);
						});
					}

					if (room_id) {
						websockets.in(room_id).emit('event:rep_up', {
							uid: uid !== postData.uid ? postData.uid : 0,
							pid: pid
						});
					}

					socket.emit('posts.favourite', {
						pid: pid
					});
				}
			});
		});
	};

	Favourites.unfavourite = function (pid, room_id, uid, socket) {
		var	websockets = require('./socket.io');

		if (uid === 0) {
			return;
		}

		posts.getPostField(pid, 'uid', function (err, uid_of_poster) {
			Favourites.hasFavourited(pid, uid, function (err, hasFavourited) {
				if (hasFavourited) {

					db.sortedSetRemove('uid:' + uid + ':favourites', pid);

					db.setRemove('pid:' + pid + ':users_favourited', uid, function(err) {
						db.setCount('pid:' + pid + ':users_favourited', function(err, count) {
							posts.setPostField(pid, 'reputation', count);
						});
					});

					if (uid !== uid_of_poster) {
						user.incrementUserFieldBy(uid_of_poster, 'reputation', -1, function (err, newreputation) {
							db.sortedSetAdd('users:reputation', newreputation, uid_of_poster);
						});
					}

					if (room_id) {
						websockets.in(room_id).emit('event:rep_down', {
							uid: uid !== uid_of_poster ? uid_of_poster : 0,
							pid: pid
						});
					}

					socket.emit('posts.unfavourite', {
						pid: pid
					});
				}
			});
		});
	};

	Favourites.hasFavourited = function (pid, uid, callback) {
		db.isSetMember('pid:' + pid + ':users_favourited', uid, callback);
	};

	Favourites.getFavouritesByPostIDs = function (pids, uid, callback) {
		var data = {};

		function iterator(pid, next) {
			Favourites.hasFavourited(pid, uid, function (err, hasFavourited) {
				data[pid] = hasFavourited;
				next()
			});
		}

		async.each(pids, iterator, function(err) {
			callback(data);
		});
	};

	Favourites.getFavouritedUidsByPids = function (pids, callback) {
		var data = {};

		function getUids(pid, next) {
			db.getSetMembers('pid:' + pid + ':users_favourited', function(err, uids) {
				data[pid] = uids;
				next();
			});
		}

		async.each(pids, getUids, function(err) {
			callback(data);
		});
	};

}(exports));