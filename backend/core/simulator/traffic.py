"""交通流仿真：随机扰动 + 平滑 + 可选热点，输出动态边权。"""

from __future__ import annotations

from dataclasses import dataclass
import math
import time
from typing import Iterable

import numpy as np
from numpy.typing import NDArray

from core.graph import CongestionLevel, EdgeTrafficState, RoadGraph

_EPS = 1e-9


@dataclass(frozen=True, slots=True)
class TrafficConfig:
	"""交通仿真配置。"""

	base_time_factor_c: float = 1.0
	threshold: float = 0.66
	tick_interval_seconds: float = 0.5

	smoothing_alpha: float = 0.76
	noise_sigma: float = 3.4

	capacity_min: float = 26.0
	capacity_max: float = 140.0
	capacity_bottleneck_fraction: float = 0.26
	capacity_bottleneck_scale_min: float = 0.42
	capacity_bottleneck_scale_max: float = 0.72

	initial_load_ratio_min: float = 0.22
	initial_load_ratio_max: float = 0.60
	initial_hot_fraction: float = 0.18
	initial_hot_ratio_min: float = 0.75
	initial_hot_ratio_max: float = 1.12
	max_load_ratio: float = 2.0

	mean_reversion_strength: float = 0.12
	demand_wave_amplitude: float = 0.10
	demand_wave_period_seconds: float = 42.0

	hotspot_enabled: bool = True
	hotspot_fraction: float = 0.10
	hotspot_boost_mean: float = 7.2
	hotspot_boost_sigma: float = 2.1

	def __post_init__(self) -> None:
		if self.base_time_factor_c <= 0:
			raise ValueError("base_time_factor_c must be positive")
		if not (0 < self.threshold <= 1.5):
			raise ValueError("threshold must be in (0, 1.5]")
		if self.tick_interval_seconds <= 0:
			raise ValueError("tick_interval_seconds must be positive")
		if not (0 <= self.smoothing_alpha < 1):
			raise ValueError("smoothing_alpha must be in [0, 1)")
		if self.noise_sigma < 0:
			raise ValueError("noise_sigma must be non-negative")
		if self.capacity_min <= 0 or self.capacity_max <= self.capacity_min:
			raise ValueError("capacity range is invalid")
		if not (0 <= self.capacity_bottleneck_fraction <= 1):
			raise ValueError("capacity_bottleneck_fraction must be in [0, 1]")
		if self.capacity_bottleneck_scale_min <= 0 or self.capacity_bottleneck_scale_max < self.capacity_bottleneck_scale_min:
			raise ValueError("capacity_bottleneck_scale range is invalid")
		if not (0 <= self.initial_load_ratio_min <= self.initial_load_ratio_max):
			raise ValueError("initial_load_ratio range is invalid")
		if not (0 <= self.initial_hot_fraction <= 1):
			raise ValueError("initial_hot_fraction must be in [0, 1]")
		if self.max_load_ratio < 1.0:
			raise ValueError("max_load_ratio must be >= 1")
		if not (0 <= self.initial_hot_ratio_min <= self.initial_hot_ratio_max <= self.max_load_ratio):
			raise ValueError("initial_hot_ratio range is invalid")
		if not (0 <= self.mean_reversion_strength <= 1):
			raise ValueError("mean_reversion_strength must be in [0, 1]")
		if not (0 <= self.demand_wave_amplitude <= 1):
			raise ValueError("demand_wave_amplitude must be in [0, 1]")
		if self.demand_wave_period_seconds <= 0:
			raise ValueError("demand_wave_period_seconds must be positive")
		if not (0 <= self.hotspot_fraction <= 1):
			raise ValueError("hotspot_fraction must be in [0, 1]")
		if self.hotspot_boost_sigma < 0:
			raise ValueError("hotspot_boost_sigma must be non-negative")


def _congestion_level(ratio: float, threshold: float) -> CongestionLevel:
	if ratio <= threshold:
		return "green"
	if ratio <= 1.0:
		return "yellow"
	return "red"


def compute_travel_time(
	length: float,
	vehicle_count_n: float,
	capacity_v: float,
	*,
	c: float,
	threshold: float,
) -> float:
	"""按 require 的分段函数计算单条边动态耗时。"""
	ratio = max(0.0, float(vehicle_count_n) / max(float(capacity_v), _EPS))
	if ratio <= threshold:
		multiplier = 1.0
	else:
		multiplier = 1.0 + math.exp(ratio)
	return float(c * length * multiplier)


def compute_travel_times(
	edge_lengths: NDArray[np.float64],
	vehicle_counts: NDArray[np.float64],
	capacities: NDArray[np.float64],
	*,
	c: float,
	threshold: float,
) -> NDArray[np.float64]:
	"""向量化计算所有边动态耗时。"""
	ratios = np.maximum(vehicle_counts, 0.0) / np.maximum(capacities, _EPS)
	multipliers = np.ones_like(ratios, dtype=np.float64)
	mask = ratios > threshold
	multipliers[mask] = 1.0 + np.exp(ratios[mask])
	return (c * edge_lengths * multipliers).astype(np.float64)


class TrafficSimulator:
	"""基于边状态的交通流仿真器。"""

	def __init__(self, graph: RoadGraph, *, seed: int | None = None, config: TrafficConfig | None = None) -> None:
		self.graph = graph
		self.config = config or TrafficConfig()
		self._rng = np.random.default_rng(seed)

		n_edges = graph.n_edges
		base_capacities = self._rng.uniform(
			self.config.capacity_min,
			self.config.capacity_max,
			size=n_edges,
		).astype(np.float64)
		self.capacities = base_capacities.copy()
		if n_edges > 0 and self.config.capacity_bottleneck_fraction > 0:
			bottleneck_count = int(round(n_edges * self.config.capacity_bottleneck_fraction))
			if bottleneck_count > 0:
				bottleneck_idx = self._rng.choice(n_edges, size=bottleneck_count, replace=False)
				bottleneck_scale = self._rng.uniform(
					self.config.capacity_bottleneck_scale_min,
					self.config.capacity_bottleneck_scale_max,
					size=bottleneck_count,
				)
				self.capacities[bottleneck_idx] *= bottleneck_scale
		self.capacities = np.maximum(self.capacities, _EPS).astype(np.float64)

		init_ratio = self._rng.uniform(
			self.config.initial_load_ratio_min,
			self.config.initial_load_ratio_max,
			size=n_edges,
		)
		if n_edges > 0 and self.config.initial_hot_fraction > 0:
			hot_count = int(round(n_edges * self.config.initial_hot_fraction))
			if hot_count > 0:
				hot_idx = self._rng.choice(n_edges, size=hot_count, replace=False)
				hot_ratio = self._rng.uniform(
					self.config.initial_hot_ratio_min,
					self.config.initial_hot_ratio_max,
					size=hot_count,
				)
				init_ratio[hot_idx] = np.maximum(init_ratio[hot_idx], hot_ratio)
		self._baseline_load_ratio = np.clip(init_ratio, 0.0, self.config.max_load_ratio).astype(np.float64)
		self.vehicle_counts = np.clip(
			self.capacities * self._baseline_load_ratio,
			0.0,
			self.capacities * self.config.max_load_ratio,
		).astype(np.float64)

		self._hotspot_mask = np.zeros(n_edges, dtype=bool)
		if self.config.hotspot_enabled and n_edges > 0:
			hotspot_count = max(1, int(round(n_edges * self.config.hotspot_fraction)))
			hotspot_idx = self._rng.choice(n_edges, size=hotspot_count, replace=False)
			self._hotspot_mask[hotspot_idx] = True
		self._demand_phase = float(self._rng.uniform(0.0, 2.0 * math.pi))

		self._timestamp = time.time()

	@property
	def timestamp(self) -> float:
		return self._timestamp

	def tick(self, dt: float = 1.0) -> None:
		if dt <= 0:
			raise ValueError("dt must be positive")

		std = self.config.noise_sigma * math.sqrt(dt)
		target = self.vehicle_counts + self._rng.normal(0.0, std, size=self.vehicle_counts.shape[0])

		if self.config.hotspot_enabled and np.any(self._hotspot_mask):
			hotspot_count = int(np.sum(self._hotspot_mask))
			hotspot_delta = self._rng.normal(
				loc=self.config.hotspot_boost_mean * dt,
				scale=self.config.hotspot_boost_sigma * math.sqrt(dt),
				size=hotspot_count,
			)
			target[self._hotspot_mask] += hotspot_delta

		if self.config.demand_wave_amplitude > 0:
			period = max(self.config.demand_wave_period_seconds, _EPS)
			phase = (2.0 * math.pi * self._timestamp / period) + self._demand_phase
			wave = 1.0 + self.config.demand_wave_amplitude * math.sin(phase)
			desired_ratio = np.clip(self._baseline_load_ratio * wave, 0.0, self.config.max_load_ratio)
			desired_counts = self.capacities * desired_ratio
			reversion = self.config.mean_reversion_strength
			target = (1.0 - reversion) * target + reversion * desired_counts

		max_counts = self.capacities * self.config.max_load_ratio
		target = np.clip(target, 0.0, max_counts)

		alpha = self.config.smoothing_alpha
		self.vehicle_counts = alpha * self.vehicle_counts + (1.0 - alpha) * target
		self.vehicle_counts = np.clip(self.vehicle_counts, 0.0, max_counts)

		self._timestamp += dt

	def congestion_stats(self) -> dict[str, float]:
		ratios = np.maximum(self.vehicle_counts, 0.0) / np.maximum(self.capacities, _EPS)
		if ratios.size == 0:
			return {
				"n_edges": 0.0,
				"green_ratio": 0.0,
				"yellow_ratio": 0.0,
				"red_ratio": 0.0,
				"load_ratio_mean": 0.0,
				"load_ratio_std": 0.0,
				"load_ratio_p50": 0.0,
				"load_ratio_p90": 0.0,
				"load_ratio_p99": 0.0,
			}

		green_mask = ratios <= self.config.threshold
		yellow_mask = (ratios > self.config.threshold) & (ratios <= 1.0)
		red_mask = ratios > 1.0
		q50, q90, q99 = np.quantile(ratios, [0.5, 0.9, 0.99])

		return {
			"n_edges": float(ratios.size),
			"green_ratio": float(np.mean(green_mask)),
			"yellow_ratio": float(np.mean(yellow_mask)),
			"red_ratio": float(np.mean(red_mask)),
			"load_ratio_mean": float(np.mean(ratios)),
			"load_ratio_std": float(np.std(ratios)),
			"load_ratio_p50": float(q50),
			"load_ratio_p90": float(q90),
			"load_ratio_p99": float(q99),
		}

	def dynamic_edge_weights(self) -> NDArray[np.float64]:
		return compute_travel_times(
			self.graph.edge_lengths,
			self.vehicle_counts,
			self.capacities,
			c=self.config.base_time_factor_c,
			threshold=self.config.threshold,
		)

	def snapshot(self, edge_ids: Iterable[int] | None = None) -> list[EdgeTrafficState]:
		if edge_ids is None:
			ids = range(self.graph.n_edges)
		else:
			ids = edge_ids

		travel_times = self.dynamic_edge_weights()
		out: list[EdgeTrafficState] = []
		for eid in ids:
			idx = int(eid)
			if not (0 <= idx < self.graph.n_edges):
				continue
			v = float(self.capacities[idx])
			n = float(self.vehicle_counts[idx])
			ratio = n / max(v, _EPS)
			out.append(
				EdgeTrafficState(
					edge_id=idx,
					capacity_v=v,
					vehicle_count_n=n,
					load_ratio=float(ratio),
					dynamic_travel_time=float(travel_times[idx]),
					congestion_level=_congestion_level(float(ratio), self.config.threshold),
				)
			)
		return out
