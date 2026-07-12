from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
from itertools import combinations
from math import factorial, sqrt
from typing import Iterable

import networkx as nx


Point = tuple[int, int]
Edge = frozenset[Point]
Triangle = frozenset[Point]

LATTICE_DIRECTIONS: tuple[Point, ...] = (
    (1, 0),
    (0, 1),
    (-1, 1),
    (-1, 0),
    (0, -1),
    (1, -1),
)


def add(left: Point, right: Point) -> Point:
    return left[0] + right[0], left[1] + right[1]


def scale(point: Point, factor: int) -> Point:
    return point[0] * factor, point[1] * factor


def cartesian(point: tuple[float, float]) -> tuple[float, float]:
    return point[0] + point[1] / 2, sqrt(3) * point[1] / 2


def polygon_edges(vertices: Iterable[Point]) -> list[Edge]:
    vertices = list(vertices)
    return [
        frozenset((vertices[index], vertices[(index + 1) % len(vertices)]))
        for index in range(len(vertices))
    ]


def triangle_edges(triangle: Triangle) -> set[Edge]:
    return {frozenset(edge) for edge in combinations(triangle, 2)}


def regular_hexagon(center: Point, side: int = 1) -> list[Point]:
    return [add(center, scale(direction, side)) for direction in LATTICE_DIRECTIONS]


def elementary_triangles_in_hexagon(center: Point, side: int) -> set[Triangle]:
    boundary = [cartesian(point) for point in regular_hexagon(center, side)]

    def cross(
        origin: tuple[float, float],
        first: tuple[float, float],
        second: tuple[float, float],
    ) -> float:
        return (
            (first[0] - origin[0]) * (second[1] - origin[1])
            - (first[1] - origin[1]) * (second[0] - origin[0])
        )

    def inside(point: tuple[float, float]) -> bool:
        return all(
            cross(boundary[index], boundary[(index + 1) % 6], point) >= -1e-9
            for index in range(6)
        )

    result: set[Triangle] = set()
    for first in range(center[0] - side - 2, center[0] + side + 3):
        for second in range(center[1] - side - 2, center[1] + side + 3):
            candidates = (
                frozenset(((first, second), (first + 1, second), (first, second + 1))),
                frozenset(
                    (
                        (first + 1, second),
                        (first, second + 1),
                        (first + 1, second + 1),
                    )
                ),
            )
            for triangle in candidates:
                centroid = tuple(
                    sum(cartesian(vertex)[axis] for vertex in triangle) / 3
                    for axis in range(2)
                )
                if inside(centroid):
                    result.add(triangle)
    return result


def elementary_triangles_in_unit_hexagon(center: Point) -> set[Triangle]:
    ring = regular_hexagon(center)
    return {
        frozenset((center, ring[index], ring[(index + 1) % 6]))
        for index in range(6)
    }


def all_rhombus_matchings(
    triangles: set[Triangle],
) -> list[tuple[tuple[Triangle, Triangle], ...]]:
    neighbors: dict[Triangle, list[Triangle]] = defaultdict(list)
    for left, right in combinations(triangles, 2):
        if len(left & right) == 2:
            neighbors[left].append(right)
            neighbors[right].append(left)

    result: list[tuple[tuple[Triangle, Triangle], ...]] = []

    def visit(
        remaining: set[Triangle],
        pairs: list[tuple[Triangle, Triangle]],
    ) -> None:
        if not remaining:
            result.append(tuple(pairs))
            return
        triangle = min(
            remaining,
            key=lambda item: (len(set(neighbors[item]) & remaining), sorted(item)),
        )
        for neighbor in neighbors[triangle]:
            if neighbor in remaining:
                visit(remaining - {triangle, neighbor}, pairs + [(triangle, neighbor)])

    visit(set(triangles), [])
    unique: dict[
        frozenset[frozenset[Triangle]], tuple[tuple[Triangle, Triangle], ...]
    ] = {}
    for matching in result:
        unique[frozenset(frozenset(pair) for pair in matching)] = matching
    return list(unique.values())


@dataclass(frozen=True)
class Piece:
    name: str
    shape: str
    triangles: frozenset[Triangle]

    @property
    def boundary(self) -> tuple[Edge, ...]:
        counts: Counter[Edge] = Counter()
        for triangle in self.triangles:
            counts.update(triangle_edges(triangle))
        edges = [edge for edge, count in counts.items() if count == 1]
        center = tuple(
            sum(cartesian(point)[axis] for edge in edges for point in edge)
            / (2 * len(edges))
            for axis in range(2)
        )

        def midpoint_angle(edge: Edge) -> float:
            from math import atan2

            midpoint = tuple(
                sum(cartesian(point)[axis] for point in edge) / 2 for axis in range(2)
            )
            return atan2(midpoint[1] - center[1], midpoint[0] - center[0])

        boundary = sorted(edges, key=midpoint_angle)
        if self.shape == "rhombus":
            for index in range(4):
                shared = boundary[index] & boundary[(index + 1) % 4]
                assert len(shared) == 1
                vertex = cartesian(next(iter(shared)))
                left = cartesian(next(iter(boundary[index] - shared)))
                right = cartesian(next(iter(boundary[(index + 1) % 4] - shared)))
                first = (left[0] - vertex[0], left[1] - vertex[1])
                second = (right[0] - vertex[0], right[1] - vertex[1])
                if first[0] * second[0] + first[1] * second[1] > 0:
                    boundary = boundary[index:] + boundary[:index]
                    break
        return tuple(boundary)


@dataclass
class Board:
    name: str
    center: Point
    side: int
    pieces: tuple[Piece, ...]

    @property
    def outside_edges(self) -> set[Edge]:
        graph = self.adjacency()
        internal = {
            edge
            for piece in self.pieces
            for neighbor in graph.neighbors(piece.name)
            for edge in (set(piece.boundary) & set(self.piece(neighbor).boundary))
        }
        return {
            edge
            for piece in self.pieces
            for edge in piece.boundary
            if edge not in internal
        }

    def piece(self, name: str) -> Piece:
        return next(piece for piece in self.pieces if piece.name == name)

    def adjacency(self) -> nx.Graph:
        graph = nx.Graph()
        for piece in self.pieces:
            graph.add_node(piece.name, shape=piece.shape)
        for left, right in combinations(self.pieces, 2):
            shared = set(left.boundary) & set(right.boundary)
            if shared:
                assert len(shared) == 1
                shared_edge = next(iter(shared))
                graph.add_edge(
                    left.name,
                    right.name,
                    piece_edges={
                        left.name: left.boundary.index(shared_edge),
                        right.name: right.boundary.index(shared_edge),
                    },
                )
        return graph

    def signature(self) -> tuple[int, ...]:
        graph = self.adjacency()
        return tuple(sorted(dict(graph.degree()).values()))


def make_board(
    name: str,
    center: Point,
    side: int,
    hex_centers: tuple[Point, ...],
    expected_rhombus_degrees: tuple[int, ...],
) -> list[Board]:
    large_hexagon = elementary_triangles_in_hexagon(center, side)
    hexagons = [
        Piece(
            name=f"H{index}",
            shape="hexagon",
            triangles=frozenset(elementary_triangles_in_unit_hexagon(hex_center)),
        )
        for index, hex_center in enumerate(hex_centers)
    ]
    used = set().union(*(piece.triangles for piece in hexagons))
    remaining = large_hexagon - used
    assert len(large_hexagon) == 6 * side * side
    assert len(remaining) % 2 == 0

    boards = []
    for matching_index, matching in enumerate(all_rhombus_matchings(remaining)):
        rhombi = [
            Piece(
                name=f"R{index}",
                shape="rhombus",
                triangles=frozenset(pair),
            )
            for index, pair in enumerate(matching)
        ]
        board = Board(
            name=f"{name}-{matching_index}",
            center=center,
            side=side,
            pieces=tuple(hexagons + rhombi),
        )
        graph = board.adjacency()
        rhombus_degrees = tuple(
            sorted(graph.degree[piece.name] for piece in rhombi)
        )
        if rhombus_degrees == tuple(sorted(expected_rhombus_degrees)):
            boards.append(board)
    return boards


def describe_board(board: Board) -> None:
    graph = board.adjacency()
    print(f"\n{board.name}: {len(board.pieces)} pieces, {graph.number_of_edges()} joins")
    for piece in board.pieces:
        neighbors = []
        for neighbor in graph.neighbors(piece.name):
            edge = graph.edges[piece.name, neighbor]
            own_edge = edge["piece_edges"][piece.name]
            neighbors.append(f"{neighbor}@{own_edge}")
        external = [
            index
            for index, edge in enumerate(piece.boundary)
            if edge in board.outside_edges
        ]
        print(
            f"  {piece.name} {piece.shape[0].upper()}: "
            f"degree={graph.degree[piece.name]}, outside={external}, "
            f"neighbors={neighbors}"
        )


def pair_class(piece: Piece, edge_pair: frozenset[int]) -> str:
    left, right = sorted(edge_pair)
    if piece.shape == "hexagon":
        distance = min((right - left) % 6, (left - right) % 6)
        return f"H{distance}"

    distance = min((right - left) % 4, (left - right) % 4)
    if distance == 2:
        return f"RP{left % 2}"

    shared = piece.boundary[left] & piece.boundary[right]
    if not shared:
        shared = piece.boundary[left] & piece.boundary[(right + 4) % 4]
    assert len(shared) == 1
    vertex = cartesian(next(iter(shared)))
    left_other = cartesian(next(iter(piece.boundary[left] - shared)))
    right_other = cartesian(next(iter(piece.boundary[right] - shared)))
    first = (left_other[0] - vertex[0], left_other[1] - vertex[1])
    second = (right_other[0] - vertex[0], right_other[1] - vertex[1])
    dot = first[0] * second[0] + first[1] * second[1]
    return "RA" if dot > 0 else "RO"


def edge_pair_at_piece(
    board: Board,
    graph: nx.Graph,
    piece_name: str,
    graph_edges: Iterable[frozenset[str]],
) -> frozenset[int]:
    selected_neighbors = [
        next(iter(edge - {piece_name}))
        for edge in graph_edges
        if piece_name in edge
    ]
    return frozenset(
        graph.edges[piece_name, neighbor]["piece_edges"][piece_name]
        for neighbor in selected_neighbors
    )


def factor_signature(
    board: Board,
    graph: nx.Graph,
    graph_edges: frozenset[frozenset[str]],
) -> tuple[tuple[tuple[str, int], ...], tuple[tuple[str, int], ...]]:
    counts = {"hexagon": Counter(), "rhombus": Counter()}
    for piece in board.pieces:
        edge_pair = edge_pair_at_piece(board, graph, piece.name, graph_edges)
        assert len(edge_pair) == 2
        counts[piece.shape][pair_class(piece, edge_pair)] += 1
    return tuple(sorted(counts["hexagon"].items())), tuple(
        sorted(counts["rhombus"].items())
    )


def enumerate_two_factors(
    board: Board,
) -> list[
    tuple[
        frozenset[frozenset[str]],
        bool,
        tuple[tuple[tuple[str, int], ...], tuple[tuple[str, int], ...]],
    ]
]:
    graph = board.adjacency()
    graph_edges = tuple(frozenset(edge) for edge in graph.edges())
    incident = {
        node: tuple(index for index, edge in enumerate(graph_edges) if node in edge)
        for node in graph.nodes()
    }
    results = []

    def propagate(assignments: list[int]) -> bool:
        changed = True
        while changed:
            changed = False
            for node, indices in incident.items():
                selected = sum(assignments[index] == 1 for index in indices)
                undecided = [index for index in indices if assignments[index] == -1]
                if selected > 2 or selected + len(undecided) < 2:
                    return False
                forced = None
                if selected == 2:
                    forced = 0
                elif selected + len(undecided) == 2:
                    forced = 1
                if forced is not None:
                    for index in undecided:
                        assignments[index] = forced
                        changed = True
        return True

    def visit(assignments: list[int]) -> None:
        if not propagate(assignments):
            return
        try:
            edge_index = assignments.index(-1)
        except ValueError:
            selected = frozenset(
                graph_edges[index]
                for index, assignment in enumerate(assignments)
                if assignment == 1
            )
            selected_graph = nx.Graph()
            selected_graph.add_nodes_from(graph.nodes())
            selected_graph.add_edges_from(tuple(edge) for edge in selected)
            connected = nx.is_connected(selected_graph)
            results.append(
                (
                    selected,
                    connected,
                    factor_signature(board, graph, selected),
                )
            )
            return

        for assignment in (1, 0):
            next_assignments = assignments.copy()
            next_assignments[edge_index] = assignment
            visit(next_assignments)

    visit([-1] * len(graph_edges))
    return results


def signature_size(signature: tuple[tuple[str, int], ...]) -> int:
    return sum(count for _, count in signature)


def multiset_permutations(signature: tuple[tuple[str, int], ...]) -> int:
    total = signature_size(signature)
    result = factorial(total)
    for _, count in signature:
        result //= factorial(count)
    return result


def boundary_legal_placements(
    board: Board,
    signature: tuple[tuple[tuple[str, int], ...], tuple[tuple[str, int], ...]],
) -> int:
    graph = board.adjacency()
    slot_options: dict[str, Counter[str]] = {}
    for piece in board.pieces:
        internal_edges = [
            graph.edges[piece.name, neighbor]["piece_edges"][piece.name]
            for neighbor in graph.neighbors(piece.name)
        ]
        options = Counter(
            pair_class(piece, frozenset(pair))
            for pair in combinations(internal_edges, 2)
        )
        slot_options[piece.name] = options

    result = 1
    for shape, shape_signature in zip(("hexagon", "rhombus"), signature):
        slots = [piece.name for piece in board.pieces if piece.shape == shape]
        initial = tuple(count for _, count in shape_signature)
        classes = tuple(name for name, _ in shape_signature)
        memo: dict[tuple[int, tuple[int, ...]], int] = {}

        def assign(slot_index: int, remaining: tuple[int, ...]) -> int:
            key = slot_index, remaining
            if key in memo:
                return memo[key]
            if slot_index == len(slots):
                return int(not any(remaining))
            total = 0
            for class_index, class_name in enumerate(classes):
                if remaining[class_index] == 0:
                    continue
                local_options = slot_options[slots[slot_index]][class_name]
                if not local_options:
                    continue
                next_remaining = list(remaining)
                next_remaining[class_index] -= 1
                total += local_options * assign(slot_index + 1, tuple(next_remaining))
            memo[key] = total
            return total

        result *= assign(0, initial)
    return result


def csp_search_stats(
    board: Board,
    signature: tuple[tuple[tuple[str, int], ...], tuple[tuple[str, int], ...]],
) -> Counter[str]:
    graph = board.adjacency()
    inventory = {
        class_name: count
        for shape_signature in signature
        for class_name, count in shape_signature
    }
    domains: dict[str, dict[str, tuple[frozenset[int], ...]]] = {}
    for piece in board.pieces:
        by_class: dict[str, list[frozenset[int]]] = defaultdict(list)
        internal_edges = [
            graph.edges[piece.name, neighbor]["piece_edges"][piece.name]
            for neighbor in graph.neighbors(piece.name)
        ]
        for pair in combinations(internal_edges, 2):
            edge_pair = frozenset(pair)
            by_class[pair_class(piece, edge_pair)].append(edge_pair)
        domains[piece.name] = {
            class_name: tuple(pairs) for class_name, pairs in by_class.items()
        }

    stats = Counter()
    assigned: dict[str, tuple[str, frozenset[int]]] = {}

    def consistent(piece_name: str, pair: frozenset[int]) -> bool:
        for neighbor in graph.neighbors(piece_name):
            if neighbor not in assigned:
                continue
            neighbor_pair = assigned[neighbor][1]
            own_edge = graph.edges[piece_name, neighbor]["piece_edges"][piece_name]
            neighbor_edge = graph.edges[piece_name, neighbor]["piece_edges"][neighbor]
            if (own_edge in pair) != (neighbor_edge in neighbor_pair):
                return False
        return True

    def options(piece_name: str) -> list[tuple[str, frozenset[int]]]:
        shape_prefix = "H" if board.piece(piece_name).shape == "hexagon" else "R"
        return [
            (class_name, pair)
            for class_name, pairs in domains[piece_name].items()
            if class_name.startswith(shape_prefix) and inventory.get(class_name, 0)
            for pair in pairs
            if consistent(piece_name, pair)
        ]

    def visit() -> None:
        stats["nodes"] += 1
        if len(assigned) == len(board.pieces):
            selected_edges = frozenset(
                frozenset((left, right))
                for left, right in graph.edges()
                if graph.edges[left, right]["piece_edges"][left]
                in assigned[left][1]
            )
            selected_graph = nx.Graph()
            selected_graph.add_nodes_from(graph.nodes())
            selected_graph.add_edges_from(tuple(edge) for edge in selected_edges)
            stats["loops" if nx.is_connected(selected_graph) else "multiple"] += 1
            return

        unassigned = [name for name in graph.nodes() if name not in assigned]
        option_sets = [(len(options(name)), name, options(name)) for name in unassigned]
        option_count, piece_name, piece_options = min(option_sets)
        if option_count == 0:
            stats["dead_ends"] += 1
            return
        if option_count == 1:
            stats["forced_moves"] += 1
        else:
            stats["branch_nodes"] += 1
            stats["branch_options"] += option_count

        for class_name, pair in piece_options:
            assigned[piece_name] = (class_name, pair)
            inventory[class_name] -= 1
            if all(options(name) for name in unassigned if name != piece_name):
                visit()
            else:
                stats["forward_prunes"] += 1
            inventory[class_name] += 1
            del assigned[piece_name]

    visit()
    return stats


def analyze_patterns(board: Board) -> None:
    factors = enumerate_two_factors(board)
    summary: dict[
        tuple[tuple[tuple[str, int], ...], tuple[tuple[str, int], ...]],
        Counter[str],
    ] = defaultdict(Counter)
    for _, connected, signature in factors:
        summary[signature]["loops" if connected else "multiple"] += 1

    print(f"\n{board.name} has {len(factors)} locally valid 2-factors")
    ranked = sorted(
        summary.items(),
        key=lambda item: (
            not (1 <= item[1]["loops"] <= 12),
            item[1]["multiple"],
            item[1]["loops"],
            -len(item[0][0]) - len(item[0][1]),
        ),
    )
    for signature, counts in ranked:
        if counts["loops"] == 0:
            continue
        boundary_legal = boundary_legal_placements(board, signature)
        print(
            f"  {signature}: loops={counts['loops']}, "
            f"multi={counts['multiple']}, boundary-legal={boundary_legal}, "
            f"success={counts['loops'] / boundary_legal:.6%}, "
            f"MRV={dict(csp_search_stats(board, signature))}"
        )


def format_selected_edges(edges: frozenset[frozenset[str]]) -> str:
    return ", ".join(
        "-".join(sorted(edge))
        for edge in sorted(edges, key=lambda item: tuple(sorted(item)))
    )


def show_target_pattern(
    board: Board,
    target: tuple[tuple[tuple[str, int], ...], tuple[tuple[str, int], ...]],
) -> None:
    graph = board.adjacency()
    matches = [
        factor
        for factor in enumerate_two_factors(board)
        if factor[2] == target
    ]
    print(f"\nTarget pattern on {board.name}:")
    for index, (edges, connected, _) in enumerate(matches, start=1):
        print(f"  arrangement {index}: {'ONE LOOP' if connected else 'MULTIPLE LOOPS'}")
        print(f"    joins: {format_selected_edges(edges)}")
        for piece in board.pieces:
            pair = edge_pair_at_piece(board, graph, piece.name, edges)
            print(
                f"    {piece.name}: edges {sorted(pair)} "
                f"({pair_class(piece, pair)})"
            )


def analyze_small_multi_arc(board: Board) -> None:
    graph = board.adjacency()
    rhombi = [piece for piece in board.pieces if piece.shape == "rhombus"]
    hexagons = [piece for piece in board.pieces if piece.shape == "hexagon"]
    fixed_rhombus_pairs = {
        piece.name: frozenset(graph.neighbors(piece.name)) for piece in rhombi
    }

    local_pairings: dict[str, dict[str, tuple[frozenset[str], ...]]] = {}
    for piece in hexagons:
        internal_by_edge = {
            graph.edges[piece.name, neighbor]["piece_edges"][piece.name]: neighbor
            for neighbor in graph.neighbors(piece.name)
        }
        active_set = set(internal_by_edge)
        start = next(
            edge
            for edge in active_set
            if (edge - 1) % 6 not in active_set
        )
        active = [(start + offset) % 6 for offset in range(4)]
        neighbors = [internal_by_edge[edge] for edge in active]
        local_pairings[piece.name] = {
            "S": (
                frozenset((neighbors[0], neighbors[1])),
                frozenset((neighbors[2], neighbors[3])),
            ),
            "N": (
                frozenset((neighbors[0], neighbors[3])),
                frozenset((neighbors[1], neighbors[2])),
            ),
        }

    print(f"\n{board.name} with two noncrossing arcs on each hexagon:")
    results: list[tuple[tuple[str, ...], int]] = []
    from itertools import product

    for choices in product(("S", "N"), repeat=len(hexagons)):
        arc_graph = nx.Graph()
        arc_nodes = []
        for piece in board.pieces:
            arc_count = 2 if piece.shape == "hexagon" else 1
            for arc_index in range(arc_count):
                arc_node = (piece.name, arc_index)
                arc_nodes.append(arc_node)
                arc_graph.add_node(arc_node)

        endpoint_to_arc: dict[tuple[str, str], tuple[str, int]] = {}
        for piece, choice in zip(hexagons, choices):
            for arc_index, paired_neighbors in enumerate(
                local_pairings[piece.name][choice]
            ):
                for neighbor in paired_neighbors:
                    endpoint_to_arc[(piece.name, neighbor)] = (
                        piece.name,
                        arc_index,
                    )
        for piece in rhombi:
            for neighbor in fixed_rhombus_pairs[piece.name]:
                endpoint_to_arc[(piece.name, neighbor)] = (piece.name, 0)

        for left, right in graph.edges():
            arc_graph.add_edge(
                endpoint_to_arc[(left, right)],
                endpoint_to_arc[(right, left)],
            )
        component_count = nx.number_connected_components(arc_graph)
        results.append((choices, component_count))
        print(f"  {choices}: {component_count} loop(s)")

    for count_s in range(4):
        compatible = [
            (choices, components)
            for choices, components in results
            if choices.count("S") == count_s
        ]
        one_loop = sum(components == 1 for _, components in compatible)
        print(
            f"  piece multiset Sx{count_s}/Nx{3-count_s}: "
            f"{one_loop} one-loop placements of {len(compatible)}"
        )


def noncrossing_matchings(size: int) -> tuple[tuple[tuple[int, int], ...], ...]:
    assert size % 2 == 0

    def visit(items: tuple[int, ...]) -> list[tuple[tuple[int, int], ...]]:
        if not items:
            return [()]
        first = items[0]
        results = []
        for split in range(1, len(items), 2):
            second = items[split]
            for inside in visit(items[1:split]):
                for outside in visit(items[split + 1 :]):
                    results.append(((first, second),) + inside + outside)
        return results

    return tuple(visit(tuple(range(size))))


def trisection_ports(piece: Piece, edge_index: int) -> tuple[tuple[int, int], ...]:
    boundary = piece.boundary
    edge = boundary[edge_index]
    previous_edge = boundary[(edge_index - 1) % len(boundary)]
    next_edge = boundary[(edge_index + 1) % len(boundary)]
    start = next(iter(edge & previous_edge))
    end = next(iter(edge & next_edge))
    return (
        (2 * start[0] + end[0], 2 * start[1] + end[1]),
        (start[0] + 2 * end[0], start[1] + 2 * end[1]),
    )


def analyze_small_two_lane(board: Board) -> None:
    graph = board.adjacency()
    hexagons = [piece for piece in board.pieces if piece.shape == "hexagon"]
    rhombi = [piece for piece in board.pieces if piece.shape == "rhombus"]

    active_edges: dict[str, list[int]] = {}
    port_sequences: dict[str, list[tuple[int, tuple[int, int]]]] = {}
    for piece in board.pieces:
        internal = {
            graph.edges[piece.name, neighbor]["piece_edges"][piece.name]
            for neighbor in graph.neighbors(piece.name)
        }
        start = next(
            edge for edge in internal if (edge - 1) % len(piece.boundary) not in internal
        )
        ordered_edges = [
            (start + offset) % len(piece.boundary)
            for offset in range(len(piece.boundary))
            if (start + offset) % len(piece.boundary) in internal
        ]
        active_edges[piece.name] = ordered_edges
        port_sequences[piece.name] = [
            (edge, port)
            for edge in ordered_edges
            for port in trisection_ports(piece, edge)
        ]

    hex_patterns = [
        matching
        for matching in noncrossing_matchings(8)
        if all(
            port_sequences[hexagons[0].name][left][0]
            != port_sequences[hexagons[0].name][right][0]
            for left, right in matching
        )
    ]
    rhombus_patterns = [
        matching
        for matching in noncrossing_matchings(4)
        if all(
            port_sequences[rhombi[0].name][left][0]
            != port_sequences[rhombi[0].name][right][0]
            for left, right in matching
        )
    ]
    assert len(rhombus_patterns) == 1

    def component_count(
        assigned_hex_patterns: tuple[tuple[tuple[int, int], ...], ...],
    ) -> int:
        global_port_to_arcs: dict[tuple[int, int], list[tuple[str, int]]] = (
            defaultdict(list)
        )
        arc_graph = nx.Graph()
        assignments = {
            piece.name: pattern
            for piece, pattern in zip(hexagons, assigned_hex_patterns)
        }
        assignments.update(
            {piece.name: rhombus_patterns[0] for piece in rhombi}
        )
        for piece in board.pieces:
            ports = port_sequences[piece.name]
            for arc_index, (left, right) in enumerate(assignments[piece.name]):
                node = (piece.name, arc_index)
                arc_graph.add_node(node)
                global_port_to_arcs[ports[left][1]].append(node)
                global_port_to_arcs[ports[right][1]].append(node)
        for arcs in global_port_to_arcs.values():
            assert len(arcs) == 2
            arc_graph.add_edge(*arcs)
        return nx.number_connected_components(arc_graph)

    from itertools import combinations_with_replacement, permutations

    candidates = []
    for pattern_indices in combinations_with_replacement(range(len(hex_patterns)), 3):
        assignments = set(permutations(pattern_indices))
        components = Counter(
            component_count(tuple(hex_patterns[index] for index in assignment))
            for assignment in assignments
        )
        if components[1]:
            candidates.append((pattern_indices, len(assignments), components))

    candidates.sort(
        key=lambda item: (
            not (item[1] >= 3 and 1 <= item[2][1] < item[1]),
            abs(item[2][1] - 1),
            len(set(item[0])) != 3,
            item[0],
        )
    )

    print(
        f"\n{board.name} two-lane model: {len(hex_patterns)} planar hex patterns, "
        f"{len(candidates)} solvable three-piece multisets"
    )
    for indices, assignment_count, components in candidates[:10]:
        print(
            f"  patterns={indices}, assignments={assignment_count}, "
            f"loop-count outcomes={dict(sorted(components.items()))}"
        )
        for index in sorted(set(indices)):
            print(f"    P{index}: {hex_patterns[index]}")


def analyze_small_offset_endpoints() -> None:
    from itertools import combinations_with_replacement, permutations, product

    hex_types = ((0, 0), (0, 1), (1, 1))
    rhombus_types = ((0, 0), (0, 1), (1, 0), (1, 1))
    candidates = []

    for hex_inventory in combinations_with_replacement(hex_types, 3):
        hex_assignments = set(permutations(hex_inventory))
        for rhombus_inventory in combinations_with_replacement(rhombus_types, 3):
            rhombus_assignments = set(permutations(rhombus_inventory))
            solutions = set()
            attempted = 0
            for hex_assignment in hex_assignments:
                orientation_options = [
                    {(left, right), (right, left)}
                    for left, right in hex_assignment
                ]
                for oriented_hexagons in product(*orientation_options):
                    for rhombus_assignment in rhombus_assignments:
                        attempted += 1
                        if all(
                            oriented_hexagons[index][1]
                            != rhombus_assignment[index][0]
                            and rhombus_assignment[index][1]
                            != oriented_hexagons[(index + 1) % 3][0]
                            for index in range(3)
                        ):
                            solutions.add((oriented_hexagons, rhombus_assignment))
            if solutions:
                candidates.append(
                    (
                        hex_inventory,
                        rhombus_inventory,
                        attempted,
                        len(solutions),
                    )
                )

    candidates.sort(
        key=lambda item: (
            not (item[3] == 3 and item[2] >= 18),
            item[3],
            -item[2],
            item[0],
            item[1],
        )
    )
    print("\nSmall-board offset-endpoint candidates:")
    for candidate in candidates[:12]:
        print(
            f"  H={candidate[0]}, R={candidate[1]}: "
            f"{candidate[3]}/{candidate[2]} valid"
        )


def main() -> None:
    small = make_board(
        name="small",
        center=(1, 0),
        side=2,
        hex_centers=((0, 0), (2, -1), (1, 1)),
        expected_rhombus_degrees=(2, 2, 2),
    )
    large = make_board(
        name="large",
        center=(2, 0),
        side=3,
        hex_centers=((0, 0), (2, -1), (4, -2), (1, 1), (3, 0), (2, 2)),
        expected_rhombus_degrees=(2, 2, 2, 3, 3, 3, 3, 3, 3),
    )
    print(f"candidate small boards: {len(small)}")
    print(f"candidate large boards: {len(large)}")
    for board in small[:3] + large[:3]:
        describe_board(board)
        analyze_patterns(board)
    analyze_small_multi_arc(small[0])
    analyze_small_two_lane(small[0])
    analyze_small_offset_endpoints()
    show_target_pattern(
        large[0],
        (
            (("H1", 3), ("H2", 3)),
            (("RA", 3), ("RO", 3), ("RP1", 3)),
        ),
    )
    show_target_pattern(
        large[0],
        (
            (("H1", 4), ("H2", 1), ("H3", 1)),
            (("RA", 3), ("RO", 3), ("RP0", 2), ("RP1", 1)),
        ),
    )


if __name__ == "__main__":
    main()
