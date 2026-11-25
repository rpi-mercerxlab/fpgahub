import React, { useState, useEffect } from "react";
import { Section, Card, Button } from "@radix-ui/themes";
import { StreamLanguage } from "@codemirror/language";
import { vhdl } from "@codemirror/legacy-modes/mode/vhdl";
import { monokai } from "@uiw/codemirror-theme-monokai";
import { PlayIcon } from "@radix-ui/react-icons";
import CodeMirror from "@uiw/react-codemirror";

const API_BASE = process.env.REACT_APP_API_BASE;

export const ModuleViewer = ({ name, commit }) => {
	const [moduleTextVal, setModuleTextVal] = useState("");

	useEffect(() => {
		setModuleTextVal("");
		if (!name || !commit) return;

		const controller = new AbortController();
		const fetchModuleText = async () => {
			try {
				const query = new URLSearchParams({ name, commit });
				const res = await fetch(`${API_BASE}/api/module?${query}`, {
					credentials: "include",
					signal: controller.signal,
				});
				if (!res.ok) {
					throw new Error(`Server responded with ${res.status}`);
				}
				const data = await res.text();
				if (!controller.signal.aborted) setModuleTextVal(data);
			} catch (error) {
				if (controller.signal.aborted) return;
				console.error("Error fetching module text:", error);
				setModuleTextVal("Unable to load module source.");
			}
		};
		fetchModuleText();
		return () => controller.abort();
	}, [name, commit]);

	return (
		<>
			<Section
				style={{
					width: "100%",
					display: "flex",
					flexDirection: "row",
					justifyContent: "space-between",
				}}
			>
				<Card
					style={{
						width: "100%",
						display: "flex",
						flexDirection: "column",
					}}
				>
					<div
						style={{
							width: "100%",
							display: "flex",
							flexDirection: "row",
							alignContent: "center",
							justifyContent: "space-between",
							paddingBottom: "10px",
						}}
					>
						<Button
							variant="primary"
							size="2"
							disabled
							aria-label="Run testbench"
							title="Testbench simulation is currently unavailable"
						>
							<PlayIcon />
						</Button>
					</div>
					<div
						style={{
							display: "flex",
							flexDirection: "row",
							gap: "10px",
							width: "100%",
						}}
					>
						{/* Left: Module code (read-only for now) */}
						<CodeMirror
							style={{ width: "50%" }}
							height="70vh"
							extensions={[StreamLanguage.define(vhdl)]}
							editable={false}
							theme={monokai}
							value={moduleTextVal}
						/>
						{/* Right: Testbench placeholder */}
						<CodeMirror
							style={{ width: "50%" }}
							height="70vh"
							extensions={[StreamLanguage.define(vhdl)]}
							editable={false}
							readOnly={true}
							theme={monokai}
							value="-- Testbench editing and simulation are currently unavailable."
						/>
					</div>
					<div style={{ height: "10px" }} />
					{/* Bottom: Simulation output placeholder */}
					<CodeMirror
						style={{ width: "100%" }}
						height="20vh"
						extensions={[]}
						editable={false}
						theme={monokai}
						basicSetup={{
							lineNumbers: false,
							highlightActiveLine: false,
						}}
						value="Simulation is currently unavailable."
					/>
				</Card>
			</Section>
		</>
	);
};

export default ModuleViewer;
