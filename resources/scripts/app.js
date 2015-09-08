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

// alert(myServices.sb.GetStringFromName('addon_desc'));

function onPageReady() {
	
	// message bootstrap, tell him im open, and that he should startup ICGenWorker if its not yet ready
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
	}]);


document.addEventListener('DOMContentLoaded', onPageReady, false);
document.addEventListener('unload', onPageUnload, false);