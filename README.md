Time tracking in Jira Agile made easy as never before.

*Note:* your issues should have labels field available for editing for this
plugin to work.

Installation
============

Firefox
-------

Install greasemonkey first:

https://addons.mozilla.org/en-US/firefox/addon/greasemonkey/

Then, follow link: https://github.com/seletskiy/jira-agile-worklog-helper/raw/master/jira-agile-worklog-helper.user.js
Browser will ask you about installation, you've to hit 'Install' button.

Chrome
------

You will need to clone (or just download zip) repository somewhere:

    git clone git@github.com:seletskiy/jira-agile-worklog-helper.git

Go to extensions panel (chrome://extensions), enable 'Developer mode'
(top right corner).

Then hit 'Load unpacked extension...' and select directory you clone repo to.
You should select directory name and hit 'Open', *do not enter* inside
the directory.

Opera
-----

Newer versions are based on chrome so installation process is same.

Old versions of opera was not tested, however, everything should run fine
(please confirm!)

Features
========

* full Jira UI integration;
* cross-browser support;
* work both for standard and agile/kanban processes;
* time tracking without cookies, making possible to start and stop issue
from different locations;
* issues in progress can be shown via clicking corresponding button or via
JQL filter.

Usage
=====

Jira Agile Worklog Helper is working, if you can see this UI elements:

* Small icon near search that represents amount of issues currently under your work:
 ![In work badge](https://cloud.githubusercontent.com/assets/674812/4607267/4a744602-5248-11e4-8955-14483c8eba46.png)
* Start / Stop work button in standard view mode:
![In standard mode](https://cloud.githubusercontent.com/assets/674812/4607268/4facbe74-5248-11e4-94af-fab550c92152.png)
* Small start / stop work button in agile mode: ![In agile](https://cloud.githubusercontent.com/assets/674812/4607270/58c16096-5248-11e4-91a4-f829ebf9cdc6.png)

Every time you start work on the issue, just press 'Start work' button and
Helper will track time for you. When you've done, hit 'Stop work' and specify
what was done in the specified period of time.

You can see what issue in progress right now by clicking ⟳ icon on top of Jira
UI.

Tips and tricks
===============

* You can change starting point for time tracking by altering time shown near
'Stop work' button. Helper will automatically update it's state and will
continue to tick from specified value.

* `Ctrl+S` can be used as shortcut to start or stop work on issue. Shortcut
will also work in Agile/Kanban mode.

* You can create filter to show what issues are currently in progress by you
using JQL `labels in (jwh:<your-username-here>:in-work)`.

How it's work
=============

Jira Agile Worklog Helper utilizes issue labels for time tracking.

Two labels are used:
* `jwh:<your-username-here>:in-work` to track down which issues currently in progress;
* `jwh:<your-username-here>:<timestamp>` to track amount of time spent;

Disclamer
=========

Script will automatically track it's installation on the Google Analytics.
It *will not* send any private information about you and your Jira instance.
Tracking will be run only once just after installation and never again.
