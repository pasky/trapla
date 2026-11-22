import unittest

import build_structures


def rail(osm, nodes, xy):
    return {"kind": "railway", "osmWayId": osm, "nodes": nodes, "xy": xy, "tunnel": True, "tags": {"railway": "rail"}}


class RailTunnels(unittest.TestCase):
    def test_tunnel_ways_end_to_end_are_one_tunnel_portal_to_portal(self):
        # one tunnel mapped as three ways, the middle one drawn the other way round; another tunnel on its own
        graph = {"sources": [
            rail("2", ["b", "c"], [100, 0, 200, 0]),
            rail("1", ["b", "a"], [100, 0, 0, 0]),
            rail("3", ["c", "d"], [200, 0, 300, 50]),
            rail("9", ["x", "y"], [0, 500, 100, 500]),
            {"kind": "railway", "osmWayId": "5", "nodes": ["d", "e"], "xy": [300, 50, 400, 50], "tags": {"railway": "rail"}},
        ]}
        out = build_structures.rail_tunnels(graph, 1000, 1000)
        self.assertEqual(out["kind"], ["tunnel", "tunnel"])
        self.assertEqual(out["osm"], [["2", "3", "1"], ["9"]])
        self.assertEqual(out["ways"][0], [0, 0, 200, 0, 300, 50])

    def test_an_underground_junction_or_loop_has_no_portal_there(self):
        graph = {"sources": [
            rail("1", ["a", "j"], [0, 0, 100, 0]), rail("2", ["j", "b"], [100, 0, 200, 0]), rail("3", ["j", "c"], [100, 0, 100, 100]),
            rail("4", ["p", "q"], [0, 500, 50, 550]), rail("5", ["q", "p"], [50, 550, 0, 500]),
        ]}
        self.assertEqual(build_structures.rail_tunnels(graph, 1000, 1000)["ways"], [])

    def test_a_tunnel_off_the_map_is_left_out(self):
        graph = {"sources": [rail("1", ["a", "b"], [2000, 0, 2100, 0])]}
        self.assertEqual(build_structures.rail_tunnels(graph, 1000, 1000)["ways"], [])


if __name__ == "__main__":
    unittest.main()
