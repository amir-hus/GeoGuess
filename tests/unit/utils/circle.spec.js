import { createCircleGeoJson } from '@/utils/circle';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import distance from '@turf/distance';
import { point } from '@turf/helpers';

describe('utils/circle', () => {
    it('createCircleGeoJson: should build a closed polygon at the given radius', () => {
        const center = [101.6869, 3.139];
        const circle = createCircleGeoJson(center[1], center[0], 10, 32);

        expect(circle.type).toEqual('Feature');
        expect(circle.geometry.type).toEqual('Polygon');

        const ring = circle.geometry.coordinates[0];
        expect(ring).toHaveLength(33);
        expect(ring[0]).toEqual(ring[32]);

        ring.forEach((vertex) => {
            expect(
                distance(point(center), point(vertex), { units: 'kilometers' })
            ).toBeCloseTo(10, 1);
        });
    });

    it('createCircleGeoJson: should contain the center and exclude far points', () => {
        const circle = createCircleGeoJson(3.139, 101.6869, 10);

        expect(booleanPointInPolygon(point([101.6869, 3.139]), circle)).toBe(true);
        expect(booleanPointInPolygon(point([101.8, 3.139]), circle)).toBe(false);
    });

    it('createCircleGeoJson: should keep longitudes within -180..180 near the antimeridian', () => {
        const circle = createCircleGeoJson(0, 179.99, 50);

        circle.geometry.coordinates[0].forEach(([lng]) => {
            expect(lng).toBeGreaterThanOrEqual(-180);
            expect(lng).toBeLessThanOrEqual(180);
        });
    });
});
