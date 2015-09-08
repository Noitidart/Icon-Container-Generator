// all functions use this format for 

function returnIconset(aCreateType, aCreateName, aCreatePathDirArr) {
	// aCreateType - string. future plan to support things like tiff. in future maybe make this an arr, so can make multiple types in one shot.
		// ico - can be done on any os
		// linux - installation part is linux dependent
		// icns - requires mac, as i use iconutils
	// aCreateName - same across all os, name to create iconset with
	// aCreatePathDirArr
		// win and mac - os paths to directories you want icon written to, it will writeAtomic to each of these dirs
		// linux - array of theme names, if null, it will default to ['hicolor']
	// aBaseSrcImgPathArr
		// same across all os - os paths of images to be used as sources for bases, the sizes will be auto determined, if any of them are not square it will throw
	// aIconSizes - sizes wanted in iconset
		// win and linux - array of sizes wanted. so if just 1, will iconset will only include 1
			// win recommendation: [16, 32, 48, 64, 256] // only vista uses 64, so can ommit that
			// linux recommendation: [16, 24, 48, 96]
		// mac - leave null. as default has to be used of [16, 32, 64, 128, 256, 512, 1024] no choices about it
	// aOptions.aBadge (if >0 then must provide aBadgeSrcImgPathArr and aBageSizePerIconSize)
		// 0 - default - no badge`
		// 1 - badge it topleft
		// 2 - topright
		// 3 - bottomleft
		// 4 - bottomright
	// aOptions.aBadgeSrcImgPathArr
		// same across all os - os paths of images to be used as sources for badges, the sizes will be auto determined, if any of them are not square it will throw
	// aOptions.aBageSizePerIconSize
		// same across all os - if 
	
	
	// return value
		// on linux it installs the pngs to the appropriate folders, returns a string name to use
		// on windows it returns ico path
		// on mac it returns an icns path
	
	// this function does what:
		// windows: creates ico named aOptions.create_Name at given aOptions.create_OSPath
		// mac: creates icns at given target path
		// linux: creates png in each of the root(user) hicolor(or theme name provided) folders named aOptions.create_Name
			// if go root will need to provide sudo password
			// aOptions.linuxLevel - bit flags
				// 0 - default - user only
				// 1 - root only
				// 2 - user and root
			// aOptions.linuxSudoPassword - needed if you want to write to root
			// aOptions.themes - array of theme names to install to
				// if null will install just to hicolor theme, if pass array, make sure to pass in hicolor, as it wont default push in hicolor
	
	// pass in paths of images for base
	// pass in paths of images for badge optional
	// if badge paths passed, tell what location you want it badged 0=topleft 1=topright 2=bottomleft 3=bottomright
	// if want badged, tell for each base size, what size of badge you want, if > 1 it will use that absolution size, if <= 1 it will calc badge size based on base size. so 1/3 would make it be .333 * base size
}

function getByteDataOfImagePaths() {
	// pass an object that is keys of size, value is oject,
}

function return_KeyVal_SizeBytedata_scaleIfNecessary() {
	// pass in an object that has keys of sizes wanted, and value should be (Bytedata OR null)
		// if its null then Bytedata is scaled based on aOptions.scaleTechnique
	
	// aOptions.scaleTechnique
		// 0 - default - crisp scaling first then blurry - scale down from the Bytedata of next larger. if no larger image, then scaled up from Bytedata of previous smaller
		// 1 - blurry sclaing first then crisp - scale up from the Bytedata 
}