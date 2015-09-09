/*start - chrome stuff*/
const {classes: Cc, interfaces: Ci, manager: Cm, results: Cr, utils: Cu, Constructor: CC} = Components;
Cm.QueryInterface(Ci.nsIComponentRegistrar);
Cu.import('resource://gre/modules/devtools/Console.jsm');
Cu.import('resource://gre/modules/osfile.jsm');
Cu.import('resource://gre/modules/Promise.jsm');
Cu.import('resource://gre/modules/Services.jsm');
Cu.import('resource://gre/modules/XPCOMUtils.jsm');

// Globals
const core = {
	addon: {
		path: {
			name: 'icon-container-generator',
			locale: 'chrome://icon-container-generator/locale/'
		},
		cache_key: Math.random() // set to version on release
	}
};
var gAngScope;
// var gAngInjector;
const clientId = new Date().getTime();

// Lazy Imports
const myServices = {};
XPCOMUtils.defineLazyGetter(myServices, 'sb', function () { return Services.strings.createBundle(core.addon.path.locale + 'app.properties?' + core.addon.cache_key) }); // Randomize URI to work around bug 719376

function handleDrop(e) {
	e.stopPropagation(); // Stops some browsers from redirecting.
	e.preventDefault();

	var files = e.dataTransfer.files;
	for (var i = 0, f; f = files[i]; i++) {
		// Read the File objects in this FileList.
		console.log(i, 'f:', f);
	}
}

function handleDragOver(e) {
	if (e.preventDefault) {
		e.preventDefault(); // Necessary. Allows us to drop.
	}

	e.dataTransfer.dropEffect = 'copy';  // See the section on the DataTransfer object.

	return false;
}

function handleDocElDragOver(e) {
	if (e.preventDefault) {
		e.preventDefault(); // Necessary. Allows us to drop.
	}

	e.dataTransfer.dropEffect = 'none';  // See the section on the DataTransfer object.

	return false;
}

function onPageReady() {
	
	document.documentElement.addEventListener('dragover', handleDocElDragOver, true);
	
	// message bootstrap, tell him im open, and that he should startup ICGenWorker if its not yet ready
	document.getElementById('dropTarget_base').addEventListener('drop', handleDrop, true);
	document.getElementById('dropTarget_base').addEventListener('dragover', handleDragOver, true);
	
	document.getElementById('dropTarget_badge').addEventListener('drop', handleDrop, true);
	document.getElementById('dropTarget_badge').addEventListener('dragover', handleDragOver, true);
}

function onPageUnload() {
	// message bootstrap that im going, and there are no other clients open, then terminate ICGenWorker
}

var	ANG_APP = angular.module('iconcontainergenerator', [])
	.controller('BodyController', ['$scope', function($scope) {
		
		var MODULE = this;
		
		var gAngBody = angular.element(document.body);
		gAngScope = gAngBody.scope();
		// gAngInjector = gAngBody.injector();
		
		MODULE.aCreateType = 'ICNS';
		MODULE.aOptions_aBadge = '0';
		
		MODULE.aCreatePathDirArr = ['rawr','a'];
		
		MODULE.ifBadgeNoneUncheck = function() {
			if (MODULE.aOptions_aBadge == '0') {
				MODULE.ui_saveScaledBaseDir = undefined;
				MODULE.ui_saveScaledBadgeDir = undefined;
			}
		};
		
		MODULE.ifNoneScaleSaved_UncheckDontMake = function() {
			if (!MODULE.ui_saveScaledBaseDir && !MODULE.ui_saveScaledBadgeDir && !MODULE.ui_saveScaledIconDir) {
				MODULE.ui_dontMakeIconContainer = false;
				MODULE.aOptions_dontMakeIconContainer = false;
			} else {
				MODULE.ui_dontMakeIconContainer = true;
			}
		};
		
		MODULE.doMake = function() {
			// send message to bootstrap with image paths
		};
		
		MODULE.BrowseAndAddDir = function() {
			var fp = Cc['@mozilla.org/filepicker;1'].createInstance(Ci.nsIFilePicker);
			fp.init(Services.wm.getMostRecentWindow('navigator:browser'), 'Pick directory the icon container file should be saved in', Ci.nsIFilePicker.modeGetFolder);
			fp.appendFilters(Ci.nsIFilePicker.filterAll);

			var rv = fp.show();
			if (rv == Ci.nsIFilePicker.returnOK) {
				
				if (MODULE.aCreatePathDirArr.indexOf(fp.file.path) > -1) {
					alert('Error: This directory path is already in the list of directories to output to, it will not be added.');
				} else {
					MODULE.aCreatePathDirArr.push(fp.file.path);
				}

			}// else { // cancelled	}
		};
		
		MODULE.RemoveSelectedDirs = function() {
			for (var i=0; i<MODULE.aCreatePathDirArr_selected.length; i++) {
				MODULE.aCreatePathDirArr.splice(MODULE.aCreatePathDirArr.indexOf(MODULE.aCreatePathDirArr_selected[i]), 1);
			}
			MODULE.aCreatePathDirArr_selected = null;
		};
	}]);


document.addEventListener('DOMContentLoaded', onPageReady, false);
document.addEventListener('unload', onPageUnload, false);