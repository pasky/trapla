import unittest

from build_heritage import inside, kind_of


class HeritageTest(unittest.TestCase):
    def test_kind_by_the_first_word_that_says_it(self):
        self.assertEqual(kind_of("kostel sv. Bartoloměje se sochou a křížovou cestou"), "church")
        self.assertEqual(kind_of("venkovská usedlost s výklenkovou kapličkou"), None)  # a farmstead, not a chapel
        self.assertEqual(kind_of("hrad Mírov s kostelem sv. Markéty"), "castle")
        self.assertEqual(kind_of("tvrziště Božešice"), "fort")  # not a castle: "hrad" is no word of it
        self.assertEqual(kind_of("boží muka"), "chapel")
        self.assertEqual(kind_of("socha sv. Jana Nepomuckého"), "cross")
        self.assertEqual(kind_of("železniční most (viadukt)"), "technical")
        self.assertEqual(kind_of("měšťanský dům U Zlaté koruny"), None)

    def test_inside_is_even_odd_over_the_rings(self):
        outer, hole = [0, 0, 10, 0, 10, 10, 0, 10], [4, 4, 6, 4, 6, 6, 4, 6]
        self.assertTrue(inside([outer, hole], 2, 2))
        self.assertFalse(inside([outer, hole], 5, 5))
        self.assertFalse(inside([outer, hole], 12, 5))


if __name__ == "__main__":
    unittest.main()
