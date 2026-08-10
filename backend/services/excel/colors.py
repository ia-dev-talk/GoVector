GREEN = "#92D050"
YELLOW = "#FFFF00"
RED = "#FF0000"
ORANGE = "#FFC000"
BLUE = "#5B9BD5"
GRAY = "#D9D9D9"
WHITE = "#FFFFFF"


def interpret(color):

    if not color:
        return "NORMAL"

    color = color.upper()

    if color == GREEN:
        return "DONE"

    if color == RED:
        return "FAILED"

    if color == ORANGE:
        return "WAITING"

    if color == YELLOW:
        return "WARNING"

    if color == BLUE:
        return "ASSIGNED"

    if color == GRAY:
        return "DISABLED"

    return "NORMAL"