// Jira Agile Worklog Helper
// Version 2.4 (for JIRA 6+)
// 13-10-2014
// Autor: Stanislav Seletskiy <s.seletskiy@gmail.com>

// This is a Greasemonkey user script.
//
// To install, you need Greasemonkey: https://addons.mozilla.org/en-US/firefox/addon/748
// Then restart Firefox and revisit this script.
// Under Tools, there will be a new menu item to 'Install User Script'.
// Accept the default configuration and install.
//
// If you are using Google Chrome, enable 'Developer mode' on the extensions page,
// click 'Load unpacked extension...' and specify directory where extension is
// located.
//
// To uninstall, go to Tools/Manage User Scripts,
// select 'Jira Agile Worklog Helper', and click Uninstall.

// ==UserScript==
// @name		  Jira Agile Worklog Helper
// @namespace	  http://jira/
// @description   Tracks time have being spent on issues / Подсчитывает время, затраченное на задачи
// @match		  http://jira.ngs.local/*
// @match		  http://jira/*
// @match		  http://jira.rn/*
// @version		  3.0
// @include		  http://jira.ngs.local/*
// @include		  http://jira/*
// @include		  http://jira.rn/*
// ==/UserScript==

(function () {
var script = function () {
	var LOCK_MAX_RETRIES = 10;
	var VERSION = '3.0';

	//
	// Library functions.
	//
	var lib = {
		$: window.jQuery,
		ajs: window.AJS,
		style: function style(selector, rules) {
			var style = document.createElement('style');
			style.type = 'text/css';
			style.textContent = selector + ' {' + rules.join(';') + '}';
			document.getElementsByTagName('head')[0].appendChild(style);
		},
		now: function () {
			return new Date();
		},
		dateDiff: function (from, what) {
			var zeroTime = new Date(0);
			return new Date(from.getTime() - what.getTime() -
				zeroTime.getHours() * 60 * 60 * 1000);
		},
		parseSpent: function (spent) {
			var minutes = parseInt((spent.match(/(\d+)m/i) || [0, 1])[1]);
			var hours = parseInt((spent.match(/(\d+)h/i) || [0, 0])[1]);

			return ((hours > 0) ? hours + 'h ' : '') +
				((minutes == 0 && hours == 0) ? 1 : minutes) + 'm';
		},
		spentToDate: function (spent) {
			var minutes = parseInt((spent.match(/(\d+)m/i) || [0, 1])[1]);
			var hours = parseInt((spent.match(/(\d+)h/i) || [0, 0])[1]);

			var zeroTime = new Date(0);
			return new Date(
				(minutes + (hours - zeroTime.getHours()) * 60) * 60000);
		},
		fromDateTime: function (datetime) {
			return new Date(datetime);
		},
		timestamp: function (date) {
			return parseInt(date.getTime() / 1000);
		},
		isTyping: function () {
			var someElementIsActive = false;
			lib.$('input[type=text], textarea, select').each(function () {
				if (this == document.activeElement) {
					someElementIsActive = true;
				}
			});

			return someElementIsActive;
		},
		_: function (text) {
			if (typeof messages[lang][text] == 'undefined') {
				return text;
			} else {
				return messages[lang][text];
			}
		}
	};

	//
	// Context working in (ignore, badge-only, standard, agile).
	//
	var context = 'ignore';

	//
	// Global state, will be filled later.
	//
	var issue = {
		id: null,
		key: null,
		started: null,
		assignee: null,
	};

	//
	// Issue stages map by issue status id
	//
	var issueStages = {
		testing: 10010,
		preproduction: 10033
	}

	var user = {
		name: null,
	}

	//
	// Hotkeys codes.
	//
	var hotkeys = {
		startStopWork: 83,
		esc: 27,
		enter: 13
	};

	//
	// Language detection.
	//
	var lang = {
		'ru_RU': 'ru'
	}[lib.$('meta[name=ajs-user-locale]').attr('content')] || 'en';

	//
	// Months for different languages.
	//
	var months = {
		'ru': {
			'Jan': 'янв', 'Feb': 'фев',
			'Mar': 'мар', 'Apr': 'апр',
			'May': 'май', 'Jun': 'июн',
			'Jul': 'июл', 'Aug': 'авг',
			'Sep': 'сен', 'Oct': 'окт',
			'Nov': 'ноя', 'Dec': 'дек'
		},
		'en': {}
	};

	//
	// Messages for different languages.
	//
	var messages = {
		'ru': {
			'Time spent': 'Затрачено времени',
			'Log': 'Записать',
			'Stop without tracking': 'Остановить без записи',
			'Cancel': 'Отмена',
			'Stop work': 'Остановить работу',
			'Starting time tracker...': 'Счётчик времени...',
			'Failed': 'Ошибка',
			'Start work': 'Начать работу',
			'What amount of work was done?': 'Что было сделано?',
			'Start / Stop work': 'Начать / Закончить работу',
			'Build package': 'Собрать билдом',
			'Test package': 'Собрать тестом'
		},
		'en': {}
	};

	//
	// User interface elements.
	//
	var ui = {};
	var loadUi = function () {
		ui = {
			buttonWrap: lib.$('<li/>')
				.addClass('toolbar-item'),
			buttonWrapAgile: lib.$('<div/>'),
			stopWorkButton: (function () {
				return lib.$('<button/>')
					.addClass('aui-button')
					.addClass('worklog-helper-stop-button')
					.text(lib._('Stop work'))
			})(),
			startWorkButton: lib.$('<button/>')
					.addClass('aui-button')
					.addClass('worklog-helper-start-button')
					.text(lib._('Start work')),
			startWorkButtonAgile: lib.$('<button/>')
					.addClass('aui-button')
					.addClass('aui-button-compact')
					.addClass('worklog-helper-start-button')
					.text('▶')
					.attr('title', lib._('Start work')),
			stopWorkButtonAgile: lib.$('<button/>')
					.addClass('aui-button')
					.addClass('aui-button-compact')
					.addClass('worklog-helper-stop-button')
					.text('◼')
					.attr('title', lib._('Stop work')),
			buildButton: lib.$('<button/>')
					.addClass('aui-button')
					.addClass('worklog-helper-build-button')
					.text(lib._('Build package')),
			buildButtonAgile: lib.$('<button/>')
					.addClass('aui-button')
					.addClass('aui-button-compact')
					.addClass('worklog-helper-build-button')
					.text('⚒')
					.attr('title', 'Build/Test package'),
			opsbar: lib.$('<ul/>')
					.addClass('toolbar-group')
					.attr('id', 'opsbar-transitions-start-stop'),
			opsbarAgile: lib.$('<div/>')
					.addClass('worklog-helper-agile-buttons')
					.addClass('aui-buttons'),
			spentTimeIndicator: (function () {
				var input = lib.$('<input/>');
				input.attr('id', 'worklog-helper-spent-time');
				input.css('height', '26px');
				return input;
			}()),
			spinner: (function () {
				var li = lib.$('<li/>')
					.addClass('toolbar-item')
					.append(lib.$('<div/>')
						.attr('id', 'worklog-helper-spinner')
						.attr('aria-disabled', 'true')
						.addClass('aui-button')
						.addClass('spinning')
						.text(lib._('Starting time tracker...'))
					)

				li.spinned = false;
				li.spin = function () {
					if (li.spinned) {
						return;
					}
					var s = lib.$('<span/>');
					li.append(s);
					li.spinned = true;
					s.spin();
				}

				return li;
			})(),
			spinnerAgile: (function () {
				var div = lib.$('<div/>')
					.addClass('toolbar-item')
					.addClass('aui-button')
					.addClass('aui-button-compact')
					.addClass('worklog-helper-agile-spinner')
					.attr('aria-disabled', 'true');

				div.spinned = false;
				div.spin = function () {
					if (div.spinned) {
						return;
					}
					var s = lib.$('<div/>');
					div.append(s);
					div.spinned = true;
					s.spin();
				}

				return div;
			})(),
			worklogForm: lib.$('<div/>').append(
					'<form class="aui">' +
					'<div class="field-group">' +
						'<label for="worklog-helper-spent-time-final">' +
							lib._("Time spent") +
						'</label>' +
						'<input class="text short-field" ' +
							'id="worklog-helper-spent-time-final"' +
							'name="spent-time"/>' +
					'</div>' +
					'<div class="field-group">' +
						'<label for="worklog-description">' +
							lib._("Work description") +
						'</label>' +
						'<textarea name="spent-time-comment"' +
							'id="worklog-description"' +
							'class="textarea long-field" rows="10">' +
						'</textarea>' +
					'</div>' +
					'</form>'
				),
			worklogDialog: (function () {
				var dialog = new lib.ajs.Dialog({
					width: 800,
					height: 420,
					id: 'worklog-helper-dialog'
				});

				dialog.addHeader(lib._('What amount of work was done?'));

				dialog.addSubmit(lib._('Log'), function () {
					if (ui.stopProgressButton) {
						ui.stopProgressButton.trigger('click');
					}
					ui.worklogDialog.disable();
					stopAndTrackTime();
				});

				dialog.addButton(lib._('Stop without tracking'), function () {
					ui.worklogDialog.disable();
					if (ui.stopProgressButton) {
						ui.stopProgressButton.trigger('click');
					}
					stopWithoutTracking();
				});

				dialog.addCancel(lib._('Cancel'), function () {
					dialog.hide();
				});

				return dialog;
			}()),
			inWorkBadge: lib.$('<li/>')
				.append(lib.$('<a/>')
					.addClass('worklog-helper-in-work-amount')
					.append(lib.$('<span/>')
						.addClass('aui-icon')
						.addClass('aui-icon-small')
						.addClass('aui-iconfont-build'))
					.append(lib.$('<span/>'))),
			labelError: lib.$('<div/>')
				.append(
					lib.$('<h2/>').text(lib._('Error')))
				.append(
					lib.$('<p/>').html(lib._(
						'Looks like your issue doesn\'t have `labels` field. ' +
						'Please, ask your project admin to enable `labels` field. '
					)))
				.append(
					lib.$('<p/>').html(
						'<a target="_blank" href="https://github.com/seletskiy' +
							'/jira-agile-worklog-helper/wiki/Labels">' +
							lib._('Learn more') +
						'</a>'
					)),
			startProgressButton: null, //will be loaded dynamically
			stopProgressButton: null //will be loaded dynamically
		};

		ui.worklogDialog.addPanel('Log work', ui.worklogForm.html());
		ui.worklogForm = ui.worklogDialog.getPanel(0, 0).body;
		ui.worklogForm.find('form').submit(function() {
			ui.worklogForm
				.parents('.dialog-components')
					.find('.button-panel-submit-button')
						.focus()
						.click();
			return false;
		});

		ui.spentTimeFinalIndicator = ui.worklogForm.find('#worklog-helper-spent-time-final');
	};

	var loadDynamicUi = function() {
		if (ui.startProgressButton == null || !ui.startProgressButton.length) {
			ui.startProgressButton = lib.$('#action_id_4');
		}

		if (ui.stopProgressButton == null || !ui.stopProgressButton.length) {
			ui.stopProgressButton = lib.$('#action_id_301')
		}
	}

	loadUi();
	loadDynamicUi();

	//
	// Logic goes inside this functions.
	//
	var API = {
		inProgress: 0,

		call: function (method, url, payload, callback, error) {
			if (method != 'GET') {
				payload = JSON.stringify(payload)
			}

			API.inProgress += 1;

			lib.$.ajax({
				method: method,
				url: url,
				data: payload,
				contentType: 'application/json',
				dataType: 'json',
				success: function (response) {
					if (typeof callback != "undefined") {
						callback(response);
					}

					API.inProgress -= 1;
				},
				error: function (response) {
					if (typeof error != "undefined") {
						error(JSON.parse(response.responseText));
					}

					API.inProgress -= 1;
				}
			})
		},

		plainCall: function (method, url, payload, callback, error) {
			API.inProgress += 1;

			lib.$.ajax({
				method: method,
				url: url,
				data: payload,
				success: function (response) {
					if (typeof callback != "undefined") {
						callback(response);
					}

					API.inProgress -= 1;
				},
				error: function (response) {
					if (typeof error != "undefined") {
						error(response.responseText);
					}

					API.inProgress -= 1;
				}
			})
		}
	}

	var removeAllLocks = function (issueKey, locks) {
		updateLabels(issueKey, locks);
	}

	var pendReload = function () {
		console.log("[worklog helper] page reload pending");

		(function () {
			if (API.inProgress > 0) {
				console.log("[worklog helper] awaiting API calls: " +
					API.inProgress);
				setTimeout(arguments.callee, 300);
				return;
			}

			location.reload(true);
		})();
	}

	var acquireLock = function (issueKey, retries, callback) {
		console.log("[worklog helper] lock disabled due excessive amount of "+
			"emails sent by Jira: " +
			"https://github.com/seletskiy/jira-agile-worklog-helper/issues/3")
		callback(function(){})
		return

		var lockId = 'jwh:lock:' + Math.random();

		updateLabels(issueKey, [ { add: lockId } ], function () {
			(function (retry) {
				var callee = arguments.callee;

				getAllLabels(issueKey, function (labels) {
					var locked = true;
					var locks = [];

					lib.$.each(labels, function (k, label) {
						if (label.match(/^jwh:lock:/)) {
							locks.push({remove: label});
							if (label != lockId) {
								console.log("[worklog helper] another lock " +
									"was is acquired: " + label);
								locked = false;
							}
						}
					});

					if (locked) {
						console.log("[worklog helper] lock acquired");
						callback(function () {
							updateLabels(issueKey, [ { remove: lockId } ]);
						});
						return;
					}

					if (retry > 0) {
						setTimeout(function () { callee(retry - 1); }, 300);
					} else {
						console.log("[worklog helper] failed to acquire lock");
						callback(function () {
							removeAllLocks(issueKey, locks);
						});
					}
				});
			}(retries));
		});

	}

	var showLabelsError = function() {
		lib.ajs.InlineDialog(lib.$('#worklog-helper-spinner'),
			"label-error-dialog", function (content, trigger, showPopup) {
				content.css({"padding": "20px"}).html(ui.labelError.html());
				showPopup();
				return false;
			}
		).show();

		ui.spinner.find('.aui-button')
			.removeClass('spinning')
			.text(lib._('Failed'));
		ui.spinner.find('.spinner').remove();
	}

	var getAllLabels = function (issueKey, callback) {
		API.call('GET', '/rest/api/2/issue/' + issueKey + '/?fields=labels', {},
			function (response) {
				if (
					typeof response.fields == "undefined" ||
					typeof response.fields.labels == "undefined"
				) {
					showLabelsError()
				} else {
					callback(response.fields.labels);
				}
			}
		);
	}

	var findWorkStartedTime = function (issueKey, callback) {
		getAllLabels(issueKey, function (labels) {
			var startTime = null;
			lib.$.each(labels, function (k, label) {
				matches = /jwh:([^:]+):(\d+)/.exec(label);
				if (matches != null && matches[1] == user.name) {
					startTime = lib.fromDateTime(matches[2] * 1000);
				}
			});

			callback(startTime);
		});
	}

	var addTimeTrackingLabel = function (issueKey, startedTime, callback) {
		acquireLock(issueKey, LOCK_MAX_RETRIES, function (release) {
			updateLabels(issueKey,
				[
					{ add: 'jwh:in-work' },
					{ add: 'jwh:' + user.name + ':' + 'in-work' },
					{ add: 'jwh:' + user.name + ':' + lib.timestamp(startedTime) },
				],
				function () {
					callback();
					release();
				}
			);
		});
	}


	var removeTimeTrackingLabel = function (issueKey, startedTime, callback) {
		var labels = [
			{ remove: 'jwh:' + user.name + ':' + 'in-work' },
			{ remove: 'jwh:' + user.name + ':' + lib.timestamp(startedTime) },
		];

		acquireLock(issueKey, LOCK_MAX_RETRIES, function (release) {
			isInProgressBySomeoneElse(issueKey, user.name, function (yep) {
				if (!yep) {
					labels.push({ remove: 'jwh:in-work' });
				}
				updateLabels(issueKey, labels, function () {
					callback();
					release();
				});
			});
		});
	}

	var removeInWorkLabel = function (issueKey, callback) {
		updateLabels(issueKey, [ { remove: 'jwh:in-work' } ], callback);
	}

	var isInProgressBySomeoneElse = function (issueKey, myName, callback) {
		getAllLabels(issueKey, function (labels) {
			var result = false;

			lib.$.each(labels, function (k, label) {
				if (label.match(/jwh:[^:]+:in-work/)) {
					if (label != 'jwh:' + myName + ':in-work') {
						result = true;
					}
				}
			});

			callback(result);
		});
	}

	var updateTimeTrackingLabel = function (
		issueKey, oldTime, newTime, callback
	) {
		updateLabels(issueKey,
			[
				{ add: 'jwh:' + user.name + ':' + lib.timestamp(newTime) },
				{ remove: 'jwh:' + user.name + ':' + lib.timestamp(oldTime) },
			],
			callback
		);
	}

	var updateLabels = function (issueKey, changes, callback) {
		API.call('PUT', '/rest/api/2/issue/' + issueKey,
			{
				update: { labels: changes }
			},
			callback
		);
	}

	var startWorkOnIssue = function (issueKey) {
		addTimeTrackingLabel(issueKey, lib.now(), function () {
			pendReload();
		});
	}

	var addWorklog = function (issueKey, timeSpent, comment, callback) {
		API.call('POST', '/rest/api/2/issue/' + issueKey + '/worklog', {
				timeSpent: timeSpent,
				comment: comment
			}, callback
		);
	}

	var stopWorkOnIssue = function (issueKey, issueId) {
		ui.spentTimeFinalIndicator.val(ui.spentTimeIndicator.val());
		getLastestCommit(issueId, function (commit) {
			if (commit != null) {
				var trimMessageRe = new RegExp(
					issueKey + "[^ ]? ?", "i"
				)

				ui.worklogForm.find('textarea').val(
					commit.message.replace(trimMessageRe, "")
				);
			}
			ui.worklogDialog.show();
			ui.worklogForm.find('textarea').focus();
			ui.worklogForm.find('textarea').select();
		})
	}

	var stopAndTrackTime = function () {
		addWorklog(
			issue.key,
			ui.worklogForm.find('[name=spent-time]').val(),
			ui.worklogForm.find('[name=spent-time-comment]').val(),
			function (response) {
				removeTimeTrackingLabel(issue.key, issue.started,
					function (response) {
						ui.worklogDialog.hide();
						pendReload();
					});
			}
		)
	}

	var stopWithoutTracking = function () {
		removeTimeTrackingLabel(issue.key, issue.started,
			function (response) {
				ui.worklogDialog.hide();
				pendReload();
			});
	}

	var getIssueStage = function(issueKey, callback) {
		API.call('GET', '/rest/api/2/issue/' + issueKey, {},
			function(response) {
				callback(parseInt(response.fields.status.id))
			}
		);
	}

	var getLastestCommit = function (issueId, callback) {
		API.call('GET', '/rest/dev-status/1.0/issue/detail', {
				issueId: issueId,
				applicationType: 'stash',
				dataType: 'repository'
			}, function (response) {
				if (typeof response.detail == "undefined") {
					return callback(null);
				}

				if (response.detail.length == 0) {
					return callback(null);
				}

				var latestTimestamp = new Date(0).getTime();
				var latestCommit = null;
				lib.$.each(response.detail, function (k, detail) {
					lib.$.each(detail.repositories, function (k, repo) {
						lib.$.each(repo.commits, function (k, commit) {
							var authorTimestamp = lib.fromDateTime(
								commit.authorTimestamp
							).getTime()

							if (authorTimestamp <= latestTimestamp) {
								return
							}

							latestTimestamp = authorTimestamp
							latestCommit = commit
						});
					});
				});

				callback(latestCommit);
			}, function (error) {
				console.log(error);
				callback(null);
			}
		);
	}

	var buildPackage = function (issueKey, buildType, callback) {
		var showPopup = function(type, response) {
			// Expiremental AUI feature
			require(["aui/flag"], function(flag) {
				var popup = flag({
					type: type,
					body: response
				});
			});
		};

		API.plainCall(
			'GET',
			'http://bor.s/api/issue/' + issueKey + '/' + buildType + '/',
			{
				user_key: user.name,
				user_id: user.name
			},
			function(response) {
				showPopup('success', response)
				callback();
			},
			function(response) {
				showPopup('error', response)
				callback();
			}
		);
	}

	var bindStartWork = function () {
		ui.buttonWrap.empty();
		ui.buttonWrap.append(ui.startWorkButton);
		ui.opsbar.append(ui.buttonWrap);
		ui.startWorkButton.click(function (e) {
			if (ui.startProgressButton) {
				ui.startProgressButton.trigger('click');
			}

			ui.startWorkButton
				.attr('aria-disabled', true)
				.text(lib._('Starting...'));
			startWorkOnIssue(issue.key);
		});
	}

	var bindBuildPackage = function (buildType) {
		if (context == 'agile') {
			buildButtonText = ui.buildButtonAgile.text()
		} else {
			buildButtonText = lib._(
				buildType.charAt(0).toUpperCase() +
					buildType.slice(1) + ' package'
			);
		}

		ui.buildButton.text(buildButtonText)

		ui.buttonWrap.prepend(ui.buildButton);

		ui.buildButton.click(function (e) {
			ui.buildButton
				.attr('aria-disabled', true)
				.text(lib._('Building...'));

			buildPackage(issue.key, buildType, function () {
				ui.buildButton
					.attr('aria-disabled', false)
					.text(buildButtonText);
			});
		});
	}

	var bindStopWork = function () {
		ui.buttonWrap.empty();
		ui.buttonWrap.append(ui.stopWorkButton);

		ui.stopWorkButton.click(function (e) {
			ui.stopWorkButton.addClass('button-disabled');
			stopWorkOnIssue(issue.key, issue.id);
		});

		ui.opsbar.append(ui.buttonWrap);
	}

	var bindSpentTimeIndicator = function () {
		var input = ui.spentTimeIndicator;
		var updateTime = function () {
			var oldTime = lib.dateDiff(lib.now(), issue.started);
			input.val(lib.parseSpent(input.val()));

			var newTimeDiff = lib.spentToDate(input.val());
			var newTime = new Date();
			newTime.setTime(
				issue.started.getTime() -
					(newTimeDiff.getTime() - oldTime.getTime()));
			input.attr('disabled', true);
			updateTimeTrackingLabel(issue.key, issue.started, newTime,
				function () {
					input.removeAttr('disabled');
				}
			);
			issue.started = newTime;
			ui.spentTimeFinalIndicator.val(input.val());
		};
		input.change(updateTime);
		input.keyup(function (e) {
			e.stopPropagation();
			if (e.keyCode == hotkeys.enter) {
				updateTime();
				input[0].blur();
			} else if (e.keyCode == hotkeys.esc) {
				input.removeClass('focused');
				input[0].blur();
			}
		});
		input.focus(function () {
			input.addClass('focused');
			input.addClass('changed');
		});
		input.blur(function () {
			input.removeClass('focused');
		});
		input.mouseover(function () {
			input.addClass('focused');
		});
		input.mouseout(function () {
			if (document.activeElement != input[0]) {
				input.removeClass('focused');
			}
		})
		input.updateHeight = function () {
			// @TODO: fix hardcode.
			var height = ui.stopWorkButton.outerHeight() - 2;
			input.css('height', height + 'px');
		}

		input.insertAfter(ui.stopWorkButton);
		input.updateHeight();

		input.update = function () {
			setTimeout(input.update, 1000);
			if (issue.started == null) {
				return;
			}
			if (ui.spentTimeIndicator[0] == document.activeElement) {
				return;
			}
			var spent = lib.dateDiff(lib.now(), issue.started);
			var spentParts = [];
			spentParts.push(spent.getHours() + 'h');
			spentParts.push(spent.getMinutes() + 'm');
			input.val(lib.parseSpent(spentParts.join(' ')));
		}

		input.update();
	}

	var findAllInWorkIssues = function (callback) {
		API.call('POST', '/rest/api/2/search',
			{
				jql: 'labels in (jwh:' + user.name + ':in-work)',
				fields: ['summary']
			},
			callback
		)
	}

	var bindHotkeys = function () {
		lib.$(document).keydown(function (e) {
			if (e.ctrlKey && e.keyCode == hotkeys.startStopWork) {
				if (lib.isTyping()) {
					return ;
				} else {
					e.preventDefault();
					e.stopPropagation();
					if (issue.started == null) {
						ui.startWorkButton.click();
					} else {
						ui.stopWorkButton.click();
					}

					return false;
				}
			}
		});
	}

	bindHotkeys();

	var detectContext = function () {
		var oldContext = context;

		if (lib.$('.aui-header').length > 0) {
			context = 'badge-only';
		}

		if (lib.$('meta[name=ajs-issue-key]').length > 0) {
			context = 'issue';
			issue.key = lib.$('meta[name=ajs-issue-key]').attr('content');
		}

		if (lib.$('#key-val').length > 0) {
			context = 'issue';
			issue.key = lib.$('#key-val').attr('data-issue-key');
		}

		if (lib.$('[data-issuekey=' + issue.key + ']').length > 0) {
			issue.id = lib.$('[data-issue-key=' + issue.key + ']').attr('rel');
		}

		if (lib.$('.ghx-agile').length > 0 && lib.$('#ghx-pool').length > 0) {
			issue.key = lib.$('#ghx-detail-issue').attr('data-issuekey');
			if (issue.key != null) {
				context = 'agile';
				issue.id = lib.$('[data-issuekey=' + issue.key + ']').attr('data-issueid');
			}
		}

		if (oldContext != context) {
			console.log(
				'[worklog helper] context changed to <' + context + '>');
		}

		if (context != 'ignore' && user.name == null) {
			user.name = lib.$('[name=ajs-remote-user]').attr('content');
		}

		if (context == 'issue') {
			issue.assignee = lib.$('#assignee-val .user-hover').attr('rel')
		}
	}

	var installUiStandard = function () {
		lib.$('.ops-menus .toolbar-split-left').append(ui.opsbar);
	}

	var installUiAgile = function () {
		if (ui.opsbar != ui.opsbarAgile) {
			ui.startWorkButton = ui.startWorkButtonAgile;
			ui.buildButton = ui.buildButtonAgile;
			ui.stopWorkButton = ui.stopWorkButtonAgile;
			ui.buttonWrap = ui.buttonWrapAgile;
			ui.spinner = ui.spinnerAgile;
			ui.opsbar = ui.opsbarAgile;
		}

		lib.$('#ghx-detail-head .ghx-controls').prepend(ui.opsbar);
	}

	var isUiPresent = function () {
		if (ui.startWorkButton.is(':visible')) {
			return true;
		}
		if (ui.stopWorkButton.is(':visible')) {
			return true;
		}
		if (ui.spinner.is(':visible')) {
			return true;
		}
		return false;
	}


	var installWorkBadge = function () {
		if (ui.inWorkBadge.is(':visible')) {
			return;
		}

		findAllInWorkIssues(function(response) {
			if (response.total == 0) {
				ui.inWorkBadge.find('a').addClass('zero');
			}

			if (response.total >= 2) {
				ui.inWorkBadge.find('a').addClass('toomany');
			}

			lib.$('.aui-header-secondary .aui-nav').prepend(ui.inWorkBadge);
			ui.inWorkBadge.find('a').attr('href',
				'/issues/?jql=labels%20in%20(jwh%3A' + user.name +
					'%3Ain-work)')
			ui.inWorkBadge.find('span:last').text(
				response.total
			);
		})
	}

	var installUiLoop = function () {
		detectContext();

		setTimeout(arguments.callee, 300);

		if (context == 'ignore') {
			return;
		}

		loadDynamicUi();

		if (!isUiPresent()) {
			if (context == 'issue') {
				if (issue.assignee == user.name) {
					installUiStandard();
				}
			}

			if (context == 'agile') {
				installUiAgile();
			}

			installWorkBadge();

			if (context == 'badge-only') {
				return;
			}

			ui.opsbar.empty();
			ui.opsbar.append(ui.spinner);
			ui.spinner.spin();
			findWorkStartedTime(issue.key, function (date) {
				ui.spinner.remove();
				if (date == null) {
					bindStartWork();
				} else {
					issue.started = date;
					bindStopWork();
					bindSpentTimeIndicator();
				}

				getIssueStage(issue.key, function(stage) {
					issue.stage = stage

					switch (issue.stage) {
						case issueStages.testing:
							bindBuildPackage('build');
							break;

						case issueStages.preproduction:
							bindBuildPackage('test');
							break;
					}
				});
			});
		}
	}

	//
	// Real job begins here.
	//
	installUiLoop();

	//
	// Adds hotkey info in standart JIRA help panel.
	//
	(function () {
		setTimeout(arguments.callee, 100);
		var container = lib.$('body > div#keyboard-shortcuts-dialog')
				.filter(':last');

		var text = lib._('Start / Stop Work') + ':';

		if (container.length) {
			var alreadyInserted = container.
					find('dt:contains(' + text + ')').length;
			if (alreadyInserted) {
				return;
			}

			container.find('#shortcutsmenu .module:eq(2) .item-details li:eq(3)')
				.remove();

			container.find('#shortcutsmenu .module:eq(2) .item-details').
				append('<li><dl>' +
					'<dt>' + text + '</dt>' +
					'<dd><kbd>Ctrl</kbd>+<kbd>s</kbd></dd>' +
					'</dl></li>');
		}
	}());

	//
	// Styles section.
	//
	var styles = {
		'#worklog-helper-spent-time': [
			'border: 1px solid #ddd',
			'border-bottom-right-radius: 0.25em',
			'border-top-right-radius: 0.25em',
			'-moz-border-radius-bottomright: 0.25em',
			'-moz-border-radius-topright: 0.25em',
			'border-left: none',
			'padding-left: 3px',
			'color: #bbb',
			'height: 1.666em',
			'width: 60px',
			'padding-top: 0',
			'padding-bottom: 0',
			'padding-left: 5px',
			'font-size: 14px',
			'outline: none',
		],
		'#worklog-helper-spent-time.focused': [
			'background: lemonchiffon'
		],
		'#worklog-helper-spent-time.changed': [
			'color: black'
		],
		'#worklog-helper-spinner.spinning': [
			'padding-right: 25px'
		],
		'.ghx-agile .ghx-controls .worklog-helper-agile-spinner': [
			'padding: 12px',
			'margin-bottom: -9px'
		],
		'.ghx-agile #worklog-helper-spent-time': [
			'font-size: 12px',
			'padding-top: 0px',
			'padding-bottom: 0px'
		],
		'.worklog-helper-agile-buttons': [
			'margin-right: 10px'
		],
		'.toolbar-group .toolbar-item button.worklog-helper-start-button': [
			'outline: none',
			'margin-left: 10px !important'
		],
		'.toolbar-group .toolbar-item button.worklog-helper-stop-button': [
			'border-bottom-right-radius: 0',
			'border-top-right-radius: 0',
			'-moz-border-radius-bottomright: 0',
			'-moz-border-radius-topright: 0',
			'outline: none'
		],
		'.worklog-helper-in-work-amount .aui-icon': [
			'padding-right: 5px'
		],
		'.worklog-helper-in-work-amount.zero': [
			'color: lightslategrey'
		],
		'.worklog-helper-in-work-amount.toomany': [
			'color: orange'
		],
	};

	for (selector in styles) {
		lib.style(selector, styles[selector]);
	}

	//
	// Tracking script installation.
	//
	if (localStorage.getItem('jwh_installation_done') != VERSION) {
		console.log("[worklog helper] tracking installation v" + VERSION);
		localStorage.setItem('jwh_installation_done', VERSION);
		lib.$('body').append(
			'<img src="https://ga-beacon.appspot.com/UA-55677222-1/' +
				'jira-agile-worklog-helper/_install/v' + VERSION + '"/>'
		);
	}

	console.log('[worklog helper] running v' + VERSION);
};

(function (callback) {
	if (document.body.id != 'jira') {
		return;
	}

	var script = document.createElement('script');
	script.textContent = '(' + callback.toString() + ')();';
	document.body.appendChild(script);
}(script));
}());
// vim: noet
