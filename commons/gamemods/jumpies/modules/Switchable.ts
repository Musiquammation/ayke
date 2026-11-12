/** An element a switch module can act on. */
export interface Switchable {
	switch(code: number): void;
}
