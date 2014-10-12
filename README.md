Time tracking in Jira Agile made easy as never before.

*Note:* your issues should have labels field available for editing for this
plugin to work.

Installation
============

Firefox
-------

Install greasemonkey first:

https://addons.mozilla.org/en-US/firefox/addon/greasemonkey/

Then, follow link:

    link here

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

Newer version based on chrome so installation process is same.

Old versions of opera was not tested, however, everything should run fine
(please confirm!)

Usage
=====

Jira Agile Worklog Helper is working, if you can see this UI elements:

1
2
3

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

Disclamer
=========

Script will automatically track it's installation on the Google Analytics.
It *will not* send any private information about you and your Jira instance.
Tracking will be run only once just after installation and never again.
