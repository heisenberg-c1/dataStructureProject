export interface Bounds {
	min_x: number;
	max_x: number;
	min_y: number;
	max_y: number;
}

export interface Vertex {
	id: number;
	x: number;
	y: number;
}

export type CongestionLevel = "green" | "yellow" | "red";

export interface TrafficEdgeState {
	id: number;
	capacity_v: number;
	vehicle_count_n: number;
	load_ratio: number;
	dynamic_travel_time: number;
	congestion_level: CongestionLevel;
}

export interface Edge {
	id: number;
	u: number;
	v: number;
	length: number;
	aggregated_count?: number;
	x1?: number;
	y1?: number;
	x2?: number;
	y2?: number;
	capacity_v?: number;
	vehicle_count_n?: number;
	load_ratio?: number;
	dynamic_travel_time?: number;
	congestion_level?: CongestionLevel;
}
