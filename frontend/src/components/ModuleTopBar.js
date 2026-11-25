import React, { useEffect, useState } from "react";
import { Heading, Select, IconButton } from "@radix-ui/themes";
import { Share1Icon } from "@radix-ui/react-icons";
import { useNavigate } from "react-router-dom";

const API_BASE = process.env.REACT_APP_API_BASE;

export const ModuleTopBar = ({ name, commit, setCommit }) => {
	const navigate = useNavigate();
	const [commits, setCommits] = useState([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		setCommits([]);
		setCommit(null);
		setLoading(true);
		if (!name) {
			setLoading(false);
			return;
		}

		const controller = new AbortController();
		const loadCommits = async () => {
			try {
				const query = new URLSearchParams({ id: name });
				const response = await fetch(`${API_BASE}/api/commits?${query}`, {
					credentials: "include",
					signal: controller.signal,
				});
				if (!response.ok) {
					throw new Error(`Server responded with ${response.status}`);
				}
				const data = await response.json();
				if (!Array.isArray(data)) {
					throw new Error("Invalid module commit list.");
				}
				if (controller.signal.aborted) return;
				setCommits(data);
				setCommit(data.find((c) => c.is_current) || data[0] || null);
			} catch (error) {
				if (controller.signal.aborted) return;
				console.error("Error fetching commits:", error);
			} finally {
				if (!controller.signal.aborted) setLoading(false);
			}
		};
		loadCommits();
		return () => controller.abort();
	}, [name, setCommit]);

	return (
		<>
			<div
				style={{
					width: "100%",
					height: "8vh",
					background: "linear-gradient(to bottom, #3b1205, #1a0703)",
					borderBottom: "1px solid rgba(255, 124, 57, 0.35)",
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between", // left + right spacing
					padding: "0 2rem",
					boxSizing: "border-box",
				}}
			>
				{/* LEFT */}
				<div style={{ display: "flex", justifyContent: "flex-start" }}>
					<img src="/logo128.png" width="40%" height="40%" alt="Logo" />
				</div>

				{/* CENTER */}
				<div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
					<Heading size="7" style={{ color: "white" }}>
						{name}
					</Heading>
				</div>

				{/* RIGHT */}
				<div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "1rem" }}>
					<IconButton
						variant="ghost"
						onClick={() => navigate(`/network?highlight=${encodeURIComponent(name)}`)}
						title="View in network"
					>
						<Share1Icon height={25} width={25} />
					</IconButton>
					<Select.Root
						disabled={loading || commits.length === 0}
						value={commit ? commit.commit_hash : ""}
						onValueChange={(value) => {
							const selected = commits.find((c) => c.commit_hash === value);
							if (selected) setCommit(selected);
						}}
					>
						<Select.Trigger placeholder={loading ? "Loading..." : "No versions available"} />
						<Select.Content>
							{commits.map((c) => (
								<Select.Item
									key={c.commit_hash}
									value={c.commit_hash}
									onSelect={() => setCommit(c)}
								>
									{c.commit_hash}
								</Select.Item>
							))}
						</Select.Content>
					</Select.Root>
				</div>
			</div>
		</>
	);
};

export default ModuleTopBar;
