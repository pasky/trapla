// ------------------------------------------------
// BASIC SETUP
// ------------------------------------------------

// Create an empty scene
scene = new THREE.Scene();

// Create a basic perspective camera
var camera = new THREE.PerspectiveCamera( 75, window.innerWidth/window.innerHeight, 0.1, 1000 );
camera.position.z = 4;

scene.add( new THREE.HemisphereLight( 0x443333, 0x111122 ) );

// Create a renderer with Antialiasing
var renderer = new THREE.WebGLRenderer({antialias:true});

// Configure renderer clear color
renderer.setClearColor("#ddddff");

// Configure renderer size
renderer.setSize( window.innerWidth, window.innerHeight );

// Append Renderer to DOM
document.body.appendChild( renderer.domElement );


function getElevation(lat, lng, elevBuffer) {
			
	// resolution of dataset, 1 arc second here
	var resolution = 0.00027778;
	var hgtGridSize = 3601;

	return elevationFromlatlng(lat, lng);

	function wgs84ToPixel(lat, lng) {
		var y = Math.floor((1 - (lat % 1)) * (hgtGridSize));
		var x = Math.ceil((lng % 1) * (hgtGridSize));
		var px = (y * (hgtGridSize) * 2) + (x * 2);
		return px;
	}

	function elevationFromlatlng(lat, lng) {
		var elevation;
		var pixel = wgs84ToPixel(lat, lng);

		var g = new DataView(elevBuffer, pixel, 2);

		elevation = g.getInt16(0, false);
		return elevation;
	}

}


// ------------------------------------------------
// FUN STARTS HERE
// ------------------------------------------------

function degInRad(deg) {
	return deg * Math.PI / 180;
}


function distanceBetween(lat1, lng1, lat2, lng2) {
    var x = distance(lat1, lng1, lat1, lng2);
    var y = distance(lat1, lng2, lat2, lng2);

    function distance(lat1, lng1, lat2, lng2) {
        var R = 6371000; // metres
        var φ1 = degInRad(lat1);
        var φ2 = degInRad(lat2);
        var Δφ = degInRad(lat2 - lat1);
        var Δλ = degInRad(lng2 - lng1);

        var a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        var d = R * c;
        return d;
    }

    return {
        v: x,
        h: y,
    };
};

// returns the midpoint wgs84 coordinate between two wgs84 coordinates
function midPoint(lat1, lng1, lat2, lng2) {
    var Δλ = degInRad(lng2 - lng1);

    //convert to radians
    lat1 = degInRad(lat1);
    lat2 = degInRad(lat2);
    lng1 = degInRad(lng1);

    var Bx = Math.cos(lat2) * Math.cos(Δλ);
    var By = Math.cos(lat2) * Math.sin(Δλ);
    var lat3 = Math.atan2(Math.sin(lat1) + Math.sin(lat2), Math.sqrt((Math.cos(lat1) + Bx) * (Math.cos(lat1) + Bx) + By * By));
    var lng3 = lng1 + Math.atan2(By, Math.cos(lat1) + Bx);

    return {
        lat: lat3 * 180 / Math.PI,
        lng: lng3 * 180 / Math.PI
    };
}

function toLocal(lat1, lng1, iLat, iLng, altitude) {

	//i for intial
    var R = 6371000; // radius of earth in metres
    var φ1 = degInRad(lat1);
    var φ2 = degInRad(iLat);
    var Δφ = degInRad(iLat - lat1);
    var Δλ = degInRad(iLng - lng1);
    var altitude = altitude || 0;

    var a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    var d = R * c;
	// see http://mathforum.org/library/drmath/view/55417.html
	
    var y = Math.sin(Δλ) * Math.cos(φ2);
    var x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    var θ = Math.atan2(y, x);

    var x = d * Math.cos(θ);
    var y = d * Math.sin(θ);
    //return [x, altitude, y];
    // I use threejs THREE Vector for most of my projects as below
    return new THREE.Vector3(x,altitude, y)
}


function terrainGenerator(lat1,lng1,lat2,lng2, buffer, scene, initialPos) {

    var rawRes = 1;
    var resolution = 0.00027778;
    var hgtGridSize = 3601;


    var y1 = Math.floor((1-(lat1%1)) / resolution);
    var y2 = Math.ceil((1-(lat2%1)) / resolution);
    var x1 = Math.floor((lng1%1) / resolution);
    var x2 = Math.ceil((lng2%1) / resolution);

    var delx = x2-x1;
    var dely = y2-y1;

    var heights = [];
    for (var i=y1;i<=y2;i++) {
	for (var j=x1;j<=x2;j++){
	    var px = ((i - 1) * hgtGridSize * 2) + (j * 2);
	    var g = new DataView(buffer, px, 2);
	    var elevation = g.getInt16(0, false);
	    heights.push(elevation);
	}
    }
    console.log(heights);

    //find distance for terrain bounding box, will be given as a param to the geometry constructor
    // the distanceBetween function is in the WGS84 Projections post http://legolasthesheep.com/post/wgs84projections/
    var rec = distanceBetween(lat1,lng1,lat2,lng2);
    var geometry = new THREE.PlaneBufferGeometry(Math.floor(rec.h),Math.floor(rec.v),delx, dely);
    // rotate to make it flat
    //geometry.rotateX( - Math.PI / 2);
    var vertices = geometry.attributes.position.array;

    //copy the heightmap into the geometry vertices
    for ( var i = 0, j = 0, l = vertices.length; j < l; i ++, j += 3 ) {
	vertices[ j + 1 ] = heights[i] - 325;
    }
    console.log(geometry);

    // create a blueish hue plane
    var material2  = new THREE.MeshLambertMaterial({
	    color     : '#93f4a7',
	    transparent: true,
	    opacity    : 0.7,
	    wireframe: false,
    });

    plane = new THREE.Mesh(geometry, material2);


    //find centre point in latlng
    //both of the following two functions in WGS84 Post http://legolasthesheep.com/post/wgs84projections/

    var wgs84Pos = midPoint(lat1,lng1,lat2,lng2);
    var meshPos = toLocal(initialPos.lat, initialPos.lng, wgs84Pos.lat, wgs84Pos.lng, 20);

    plane.rotation.set(0,-Math.PI/2,0);
    plane.position.set(meshPos.x,meshPos.y,meshPos.z);
    //plane.position.set(meshPos.x,-0.5,meshPos.z);
    console.log(meshPos)

    var plane = new THREE.Mesh(
	geometry, // new THREE.PlaneBufferGeometry( 40, 40 ),
	material2 //new THREE.MeshPhongMaterial( { color: 0x999999, specular: 0x101010 } )
    );
    plane.rotation.set(-Math.PI/2,0,0);
    plane.position.set(0,-0.5,0);

    //add the plane to the scene
    scene.add(plane);
    return plane;
}


// ------
// Load terrain

var fileurl = '';

var xhr = new XMLHttpRequest();
xhr.open('GET', 'N50E015.hgt', true);
xhr.responseType = 'arraybuffer';
xhr.send();

console.log('loading');
xhr.onload = function(e) {
	if (this.status == 200) {
	    buffer = this.response;
	    renderBuffer();
	} else {
	// handle errors here
	}
}

function renderBuffer() {
    var lat1 = 50.9;
    var lng1 = 15;
    var lat2 = 50.892;
    var lng2 = 15.012;
    //var initialPos = {'lat': 50.895, 'lng': 15.006};
    var initialPos = {
	'lat': document.getElementById('initialLat').value,
	'lng': document.getElementById('initialLng').value,
    };

    console.log('pog', this);
    terrainGenerator(lat1,lng1,lat2,lng2, buffer, scene, initialPos);
    console.log('terrained');

    renderer.render(scene, camera);
    console.log('rendered');
}
