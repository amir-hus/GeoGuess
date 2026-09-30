const EARTH_RADIUS_KM = 6371.0088;

const toRadians = (degrees) => (degrees * Math.PI) / 180;
const toDegrees = (radians) => (radians * 180) / Math.PI;

/**
 * Build a circle around a point as a GeoJSON polygon Feature
 * @param {number} lat latitude of the center
 * @param {number} lng longitude of the center
 * @param {number} radiusKm radius in kilometers
 * @param {number} steps number of vertices of the polygon
 * @returns {object} GeoJSON Feature with a Polygon geometry
 */
export function createCircleGeoJson(lat, lng, radiusKm, steps = 64) {
    const lat1 = toRadians(lat);
    const lng1 = toRadians(lng);
    const angularDistance = radiusKm / EARTH_RADIUS_KM;

    const coordinates = [];
    for (let i = 0; i < steps; i++) {
        const bearing = (2 * Math.PI * i) / steps;
        const lat2 = Math.asin(
            Math.sin(lat1) * Math.cos(angularDistance) +
                Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing)
        );
        const lng2 =
            lng1 +
            Math.atan2(
                Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
                Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
            );
        coordinates.push([
            ((toDegrees(lng2) + 540) % 360) - 180,
            toDegrees(lat2),
        ]);
    }
    coordinates.push(coordinates[0]);

    return {
        type: 'Feature',
        properties: null,
        geometry: {
            type: 'Polygon',
            coordinates: [coordinates],
        },
    };
}
