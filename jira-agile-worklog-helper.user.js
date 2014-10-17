// Jira Agile Worklog Helper
// Version 1.0 (for JIRA 6+)
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
// select 'JIRA5 Worklog Helper', and click Uninstall.

// ==UserScript==
// @name		  Jira Agile Worklog Helper
// @namespace	  http://jira/
// @description   Tracks time have being spent on issues / Подсчитывает время, затраченное на задачи
// @match		  http://jira.ngs.local/*
// @match		  http://jira/*
// @match		  http://jira.rn/*
// @version		  1.0
// @include		  http://jira.ngs.local/*
// @include		  http://jira/*
// @include		  http://jira.rn/*
// ==/UserScript==

(function () {
var script = function () {
	LOCK_MAX_RETRIES = 10;

	//
	// Library functions.
	//
	var lib = {
		$: window.jQuery,
		ajs: window.AJS,
		style: function style(selector, rules) {
			var style;
			style = document.createElement('style');
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
		key: null,
		started: null,
	};

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
					.text('▶'),
			stopWorkButtonAgile: lib.$('<button/>')
					.addClass('aui-button')
					.addClass('aui-button-compact')
					.addClass('worklog-helper-stop-button')
					.text('◼'),
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
					ui.worklogDialog.disable();
					stopAndTrackTime();
				});

				dialog.addButton(lib._('Stop without tracking'), function () {
					ui.worklogDialog.disable();
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
						'<a target="_blank" href="https://github.com/seletskiy/jira-agile-worklog-helper/wiki/Labels">' +
							lib._('Learn more') +
						'</a>'
					))
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

	loadUi();

	//
	// Logic goes inside this functions.
	//
	var makeApiCall = function (type, url, payload, callback) {
		makeApiCall.inProgress += 1;
		lib.$.ajax({
			type: type,
			url: url,
			data: JSON.stringify(payload),
			contentType: 'application/json',
			dataType: 'json',
			success: function (response) {
				if (typeof callback != "undefined") {
					callback(response);
				}
				makeApiCall.inProgress -= 1;
			},
		})
	}

	makeApiCall.inProgress = 0;

	var removeAllLocks = function (issueKey, locks) {
		updateLabels(issueKey, locks);
	}

	var pendReload = function () {
		console.log("[worklog helper] page reload pending");

		(function () {
			if (makeApiCall.inProgress > 0) {
				console.log("[worklog helper] awaiting API calls: " +
					makeApiCall.inProgress);
				setTimeout(arguments.callee, 300);
				return;
			}

			location.reload(true);
		})();
	}

	var acquireLock = function (issueKey, retries, callback) {
		var lockId = 'jwh:lock:' + Math.random();

		updateLabels(issueKey, [ { add: lockId } ]);

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
		makeApiCall('GET', '/rest/api/2/issue/' + issueKey + '/?fields=labels', {},
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
		makeApiCall('PUT', '/rest/api/2/issue/' + issueKey,
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
		makeApiCall('POST', '/rest/api/2/issue/' + issueKey + '/worklog', {
				timeSpent: timeSpent,
				comment: comment
			}, callback
		);
	}

	var stopWorkOnIssue = function (issueKey) {
		ui.spentTimeFinalIndicator.val(ui.spentTimeIndicator.val());
		ui.worklogDialog.show();
		ui.worklogForm.find('textarea').focus();
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

	var bindStartWork = function () {
		ui.buttonWrap.empty();
		ui.buttonWrap.append(ui.startWorkButton);
		ui.opsbar.append(ui.buttonWrap);
		ui.startWorkButton.click(function (e) {
			ui.startWorkButton
				.attr('aria-disabled', true)
				.text(lib._('Starting...'));
			startWorkOnIssue(issue.key);
		});
	}

	var bindStopWork = function () {
		ui.buttonWrap.empty();
		ui.buttonWrap.append(ui.stopWorkButton);

		ui.stopWorkButton.click(function (e) {
			ui.stopWorkButton.addClass('button-disabled');
			stopWorkOnIssue(issue.key);
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
		makeApiCall('POST', '/rest/api/2/search',
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

		if (lib.$('.ghx-agile').length > 0 && lib.$('#ghx-pool').length > 0) {
			issue.key = lib.$('#ghx-detail-issue').attr('data-issuekey');
			if (issue.key != null) {
				context = 'agile';
			}
		}

		if (oldContext != context) {
			console.log(
				'[worklog helper] context changed to <' + context + '>');
		}

		if (context != 'ignore' && user.name == null) {
			user.name = lib.$('[name=ajs-remote-user]').attr('content');
		}

	}

	var installUiStandard = function () {
		lib.$('.ops-menus .toolbar-split-left').append(ui.opsbar);
	}

	var installUiAgile = function () {
		if (ui.opsbar != ui.opsbarAgile) {
			ui.startWorkButton = ui.startWorkButtonAgile;
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

		if (!isUiPresent()) {
			if (context == 'issue') {
				installUiStandard();
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
		var container = lib.$('body > div#keyboard-shortcuts-dialog').filter(':last');
		var text = lib._('Start / Stop Work') + ':';
		if (container.length) {
			var alreadyInserted = container.
					find('dt:contains(' + text + ')').length;
			if (alreadyInserted) {
				return;
			}
			container.find('#shortcutsmenu .module:eq(2) .item-details li:eq(3)').remove();
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
			'outline: none'
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
	if (!localStorage.getItem('jwh_installation_done')) {
		console.log("[worklog helper] tracking installation");;
		localStorage.setItem('jwh_installation_done', 1);
		lib.$('body').append(
			'<img src="https://ga-beacon.appspot.com/UA-55677222-1/jira-agile-worklog-helper/_installation"/>'
		);
	}

	console.log('[worklog helper] running');
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
