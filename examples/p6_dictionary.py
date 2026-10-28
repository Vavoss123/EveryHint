def count_colours(colours):
    counts = {}
    for colour in colours:
        counts[colour] = counts.get(colour, 0) + 1
    return counts


sample = ["red", "blue", "red", "green", "blue", "red"]
print(count_colours(sample))
