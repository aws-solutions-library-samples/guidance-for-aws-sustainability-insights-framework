/*
 *  Copyright Amazon.com Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

package com.aws.sif.execution;

import io.github.qudtlib.Qudt;
import io.github.qudtlib.model.QuantityKind;
import io.github.qudtlib.model.Unit;
import lombok.extern.slf4j.Slf4j;
import org.antlr.v4.runtime.misc.ParseCancellationException;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.junit.jupiter.MockitoExtension;

import java.io.FileWriter;
import java.io.IOException;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.util.*;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.when;

@Slf4j
@ExtendWith(MockitoExtension.class)
public class ConvertTest extends CalculatorBaseTest {

    private static Stream<Arguments> providerForSuccess() {
        return Stream.of(
                Arguments.of("convert(1,'meter','centimeter')", EvaluateResponse.builder().result(new NumberTypeValue(100))
                        .evaluated(Map.of("convert(1,'meter','centimeter')", "100")).build()),
			Arguments.of("convert(1,'millimetre','centimeter')", EvaluateResponse.builder().result(new NumberTypeValue(0.1 ))
				.evaluated(Map.of("convert(1,'millimetre','centimeter')", "0.1")).build()),
			Arguments.of("convert(1,'m','cm', qualityKind='length')", EvaluateResponse.builder().result(new NumberTypeValue(100 ))
				.evaluated(Map.of("convert(1,'m','cm', qualityKind='length')", "100")).build()),
			Arguments.of("convert(1,'keV/µM','MeV/cm', qualityKind='linear energy transfer')", EvaluateResponse.builder().result(new NumberTypeValue(10 ))
				.evaluated(Map.of("convert(1,'keV/µM','MeV/cm', qualityKind='linear energy transfer')", "10")).build()),
			Arguments.of("convert(1,'m²/kg','m²/g', qualityKind='Mass Attenuation Coefficient')", EvaluateResponse.builder().result(new NumberTypeValue(0.001 ))
				.evaluated(Map.of("convert(1,'m²/kg','m²/g', qualityKind='Mass Attenuation Coefficient')", "0.001")).build())
        );
    }

    @ParameterizedTest
    @MethodSource("providerForSuccess")
    void success(String expression, EvaluateResponse expected) {

        when(executionVisitorProvider.get()).then(invocation-> new ExecutionVisitorImpl(calculationsClient, datasetsClient, impactsClient));

        var evaluateExpressionRequest = CalculatorImpl.EvaluateExpressionRequest.builder()
                .pipelineId(PIPELINE_ID)
                .executionId(EXECUTION_ID)
                .groupContextId(GROUP_CONTEXT_ID)
                .expression(expression)
                .build();
        var actual = underTest.evaluateExpression(evaluateExpressionRequest);
        assertEquals(expected, actual);
    }

	private static Stream<Arguments> providerForFailedArithmetic() {
		return Stream.of(
			Arguments.of("convert(1,'m','L')", "Unit 'm' ('?' quantity kind) not recognized."),
			Arguments.of("convert(1,'m','L',qualityKind='length')", "Unit 'L' ('length' quantity kind) not recognized.")
		);
	}

	@ParameterizedTest
	@MethodSource("providerForFailedArithmetic")
	void failedArithmetic(String expression, String expected) {
		Map<String,DynamicTypeValue> parameters = new LinkedHashMap<>();

		// mocks
		when(executionVisitorProvider.get()).then(invocation-> new ExecutionVisitorImpl(calculationsClient, datasetsClient, impactsClient));

		Exception exception = assertThrows(ArithmeticException.class, () -> {
			var evaluateExpressionRequest = CalculatorImpl.EvaluateExpressionRequest.builder()
				.pipelineId(PIPELINE_ID)
				.executionId(EXECUTION_ID)
				.groupContextId(GROUP_CONTEXT_ID)
				.expression(expression)
				.parameters(parameters)
				.build();
			underTest.evaluateExpression(evaluateExpressionRequest);
		});
		assertEquals(expected,  exception.getMessage());
	}


	private static Stream<Arguments> providerForFailedParseCancellation() {
		return Stream.of(
			Arguments.of("convert(1,'m','L','length')", "Line 1:18 mismatched input ''length'' expecting QUALITYKIND")
		);
	}

	@ParameterizedTest
	@MethodSource("providerForFailedParseCancellation")
	void failedParseCancellation(String expression, String expected) {
		Map<String,DynamicTypeValue> parameters = new LinkedHashMap<>();

		Exception exception = assertThrows(ParseCancellationException.class, () -> {
			var evaluateExpressionRequest = CalculatorImpl.EvaluateExpressionRequest.builder()
				.pipelineId(PIPELINE_ID)
				.executionId(EXECUTION_ID)
				.groupContextId(GROUP_CONTEXT_ID)
				.expression(expression)
				.parameters(parameters)
				.build();
			underTest.evaluateExpression(evaluateExpressionRequest);
		});
		assertEquals(expected,  exception.getMessage());
	}
	/**
	 * Used to help generate the documentation
	 * @throws IOException
	 */
	public void printAll() throws IOException {
		var tmpFile = Files.createTempFile("units", ".md");
		log.info("tmpFile: " + tmpFile.toString());

		// ignored due to duplicates, and/or not applicable to SIF
		var ignoredKinds = List.of(

			// ignored as not applicable to SIF:
			"Action",
			"Compressibility",
			"Conductivity",
			"Currency",
			"Dose Equivalent",
			"Electric Conductivity",
			"Electric Dipole Moment",
			"Electric Field",
			"Electric Flux",
			"Electric Polarization",
			"Electric charge per amount of substance",
			"Flux",
			"Force Per Area Time",
			"Information flow rate",
			"Inverse Magnetic Flux",
			"Inverse Pressure",
			"Inverse Time Temperature",
			"Inverse Volume",
			"Ionic Strength",
			"Isothermal compressibility",
			"Kinematic Viscosity",
			"Linear Force",
			"Luminance",
			"Luminous Intensity",
			"Magnetic Dipole Moment",
			"Magnetic Field",
			"Magnetic Moment",
			"Magnetic Vector Potential",
			"Magnetic flux per unit length",
			"Magnetomotive Force",
			"Molality of Solute",
			"Molar Flow Rate",
			"Molar Heat Capacity",
			"Molar Mass",
			"Mortality Rate",
			"Permeability",
			"Permittivity",
			"Polarizability",
			"Pressure Coefficient",
			"Pressure Ratio",
			"Reactive Power",
			"Relative Humidity",
			"Resistance",
			"Resistivity",
			"Second Axial Moment of Area",
			"Second Polar Moment of Area",
			"Solid Angle",
			"Specific Acoustic Impedance",
			"Specific Activity",
			"Specific Entropy",
			"Specific heat capacity at constant pressure",
			"Specific heat capacity at constant volume",
			"Spectral Radiant Energy Density",
			"Standard Gravitational Parameter",
			"Stress-Optic Coefficient",
			"Surface Density",
			"Temperature Amount of Substance",
			"Temperature Ratio",
			"Thermal Conductivity",
			"Thermal Energy Length",
			"Thermal Insulance",
			"Thermal Resistance",
			"Thermal Resistivity",
			"Thrust To Mass Ratio",
			"Torque",
			"Total Linear Stopping Power",
			"Volume Fraction",
			"Volumetric Flux",
			"Warping Moment",

			// ignored due to having duplicate applicable units to other quality kinds:
			"Absolute Humidity",
			"Acceleration Of Gravity",
			"Acceptor Density",
			"Acceptor Ionization Energy",
			"Active Energy",
			"Admittance",
			"Aeric Heat Flow Rate",
			"Alpha Disintegration Energy",
			"Altitude",
			"Ambient Pressure",
			"Angle Of Attack",
			"Angle of Optical Rotation",
			"Angular Distance",
			"Angular Frequency",
			"Angular Momentum",
			"Angular Reciprocal Lattice Vector",
			"Apogee Radius",
			"Apparent Power",
			"Area per Time",
			"Atmospheric Pressure",
			"Atomic Attenuation Coefficient",
			"Atomic Charge",
			"Atomic Mass",
			"Attenuation Coefficient",
			"Auditory Thresholds",
			"Auxillary Magnetic Field",
			"Average Energy Loss per Elementary Charge Produced",
			"Average Head End Pressure",
			"Average Vacuum Thrust",
			"Bending Moment of Force",
			"Beta Disintegration Energy",
			"Bevel Gear Pitch Angle",
			"Boiling Point Temperature",
			"Bragg Angle",
			"Breadth",
			"Buckling Factor",
			"Burgers Vector",
			"Burn Rate",
			"Burn Time",
			"Carrier LifetIme",
			"Cartesian Area",
			"Cartesian Coordinates",
			"Celsius temperature",
			"Center of Gravity in the X axis",
			"Center of Gravity in the Y axis",
			"Center of Gravity in the Z axis",
			"Center of Mass (CoM)",
			"Chemical Potential",
			"Circulation",
			"Closest Approach Radius",
			"Coefficient of heat transfer",
			"Coherence Length",
			"Complex Power",
			"Compressibility Factor",
			"Conductance",
			"Conduction Speed",
			"Contract End Item (CEI) Specification Mass.",
			"Control Mass.",
			"Cross-section",
			"Cross-sectional Area",
			"Cubic Expansion Coefficient",
			"Curvature",
			"Debye Angular Frequency",
			"Delta-V",
			"Density Of The Exhaust Gases",
			"Depth",
			"Dew Point Temperature",
			"Diameter",
			"Diastolic Blood Pressure",
			"Diffusion Area",
			"Diffusion Coefficient for Fluence Rate",
			"Diffusion Length",
			"Diffusion Length (Solid State Physics)",
			"Dimensionless",
			"Dimensionless Ratio",
			"Displacement",
			"Displacement Vector of Ion",
			"Distance",
			"Donor Density",
			"Donor Ionization Energy",
			"Dry Mass",
			"Dynamic Friction",
			"Dynamic Friction Coefficient",
			"Dynamic Pressure",
			"Earth Closest Approach Vehicle Velocity",
			"Effective Mass",
			"Efficiency",
			"Electric charge per area",
			"Electric Charge Per Mass",
			"Electric Displacement",
			"Electric Displacement Field",
			"Electric Field Strength",
			"Electric Flux Density",
			"Electric Potential",
			"Electric Potential Difference",
			"Electric Power",
			"Electric Propulsion Propellant Mass",
			"Electromotive Force",
			"Electron Affinity",
			"Electron Density",
			"Electron Mean Free Path",
			"Electron Radius",
			"Elliptical Orbit Apogee Velocity",
			"Elliptical Orbit Perigee Velocity",
			"Energy Fluence Rate",
			"Energy Imparted",
			"Energy Level",
			"Energy per electric charge",
			"Enthalpy",
			"Equilibrium Position Vector of Ion",
			"Equivalent absorption area",
			"Exhaust Gases Specific Heat",
			"Exhaust Stream Power",
			"Exit Plane Cross-sectional Area",
			"Exit Plane Pressure",
			"Exit Plane Temperature",
			"Expansion Ratio",
			"Exposure",
			"Fermi Energy",
			"Final Or Current Vehicle Mass",
			"First Moment of Area",
			"First Stage Mass Ratio",
			"Fission Fuel Utilization Factor",
			"Fission Multiplication Factor",
			"Flash Point Temperature",
			"Flight Path Angle",
			"Flight Performance Reserve Propellant Mass",
			"Flächenlast",
			"Force",
			"Force Magnitude",
			"Force Per Area",
			"Force per Length",
			"Frequency",
			"Friction",
			"Friction Coefficient",
			"Fuel Bias",
			"Fundamental Lattice vector",
			"Fundamental Reciprocal Lattice Vector",
			"Gain",
			"Gap Energy",
			"Gibbs Energy",
			"Gravitational Attraction",
			"Gross Lift-Off Weight",
			"Group Speed of Sound",
			"Half-Value Thickness",
			"Head End Pressure",
			"Heat Capacity Ratio",
			"Heat Flow Rate per Unit Area",
			"Heat Flux Density",
			"Height",
			"Helmholtz Energy",
			"Hole Density",
			"Horizontal Velocity",
			"Ignition interval time",
			"Illuminance",
			"Incidence",
			"Incidence Proportion",
			"Incidence Rate",
			"Inductance",
			"Inert Mass",
			"Information Entropy",
			"Initial Expansion Ratio",
			"Initial Nozzle Throat Diameter",
			"Initial Vehicle Mass",
			"Initial Velocity",
			"Instantaneous Power",
			"Internal Energy",
			"Intinsic Carrier Density",
			"Inverse Length",
			"Ion Current",
			"Ion Density",
			"Ionic Charge",
			"Ionization Energy",
			"Irradiance",
			"Isothermal Moisture Capacity",
			"Kinetic Energy",
			"Larmor Angular Frequency",
			"Lattice Plane Spacing",
			"Lattice Vector",
			"Length Ratio",
			"Lift Coefficient",
			"Lift Force",
			"Linear Absorption Coefficient",
			"Linear Attenuation Coefficient",
			"Linear Electric Current",
			"Linear Electric Current Density",
			"Linear Expansion Coefficient",
			"Linear Ionization",
			"Linear Strain",
			"Linked Flux",
			"London Penetration Depth",
			"Loss Angle",
			"Lower Critical Magnetic Flux Density",
			"Luminous Emmitance",
			"Luminous Flux per Area",
			"Luminous Flux Ratio",
			"Macroscopic Cross-section",
			"Macroscopic Total Cross-section",
			"Magnetic Field Strength",
			"Magnetic Flux",
			"Magnetic flux density",
			"Magnetization",
			"Mass Defect",
			"Mass Delivered",
			"Mass Excess",
			"Mass Growth Allowance",
			"Mass Margin",
			"Mass Of Electrical Power Supply",
			"Mass Of Solid Booster",
			"Mass Of The Earth",
			"Mass Ratio",
			"Max Operating Thrust",
			"Max Sea Level Thrust",
			"Maximum Beta-Particle Energy",
			"Maximum Expected Operating Pressure",
			"Maximum Expected Operating Thrust",
			"Maximum Operating Pressure",
			"Mean Energy Imparted",
			"Mean Free Path",
			"Mean Lifetime",
			"Mean Linear Range",
			"Mechanical Energy",
			"Melting Point Temperature",
			"Migration Area",
			"Migration Length",
			"Moisture Diffusivity",
			"Molar Energy",
			"Molar Refractivity",
			"Molar Volume",
			"Mole Fraction",
			"Molecular Concentration",
			"Moment of Inertia",
			"Moment of Inertia in the Y axis",
			"Moment of Inertia in the Z axis",
			"Morbidity Rate",
			"Mutual Inductance",
			"Neel Temperature",
			"Neutron Diffusion Length",
			"Nominal Ascent Propellant Mass",
			"Normal Stress",
			"Nozzle Throat Cross-sectional Area",
			"Nozzle Throat Diameter",
			"Nozzle Throat Pressure",
			"Nozzle Walls Thrust Reaction",
			"Nuclear Radius",
			"Number Density",
			"Orbital Radial Distance",
			"Osmotic Pressure",
			"Over-range distance",
			"Partial Pressure",
			"Particle Current",
			"Particle Number Density",
			"Particle Position Vector",
			"Path Length",
			"Payload Mass",
			"Payload Ratio",
			"Phase coefficient",
			"Phase Difference",
			"Phase speed of sound",
			"Phonon Mean Free Path",
			"Plane Angle",
			"Polar moment of inertia",
			"Polarization Field",
			"Position Vector",
			"Positive Dimensionless Ratio",
			"Positive Length",
			"Positive Plane Angle",
			"Potential Energy",
			"Power Per Area",
			"Predicted Mass",
			"Pressure",
			"Pressure Burning Rate Constant",
			"Pressure Burning Rate Index",
			"Propagation coefficient",
			"Propellant Mass",
			"Propellant Mean Bulk Temperature",
			"Propellant Temperature",
			"Radial Distance",
			"Radiant Emmitance",
			"Radiant Energy",
			"Radiant Exposure",
			"Radiant Fluence Rate",
			"Radiant Flux",
			"Radiative Heat Transfer",
			"Radius",
			"Radius of Curvature",
			"Reaction Energy",
			"Reactor Time Constant",
			"Relative Atomic Mass",
			"Relative Mass Defect",
			"Relative Molecular Mass",
			"Relaxation TIme",
			"Reserve Mass",
			"Resistance Ratio",
			"Resonance Energy",
			"Resonance Escape Probability For Fission",
			"Rest Energy",
			"Rest Mass",
			"Reverberation Time",
			"RF-Power Level",
			"Rocket Atmospheric Transverse Force",
			"Second Moment of Area",
			"Second Stage Mass Ratio",
			"Shannon Diversity Index",
			"Shear Strain",
			"Shear Stress",
			"Signal Strength",
			"Single Stage Launcher Mass Ratio",
			"Slowing-Down Area",
			"Slowing-Down Length",
			"Sound energy density",
			"Sound exposure level",
			"Sound intensity",
			"Sound particle acceleration",
			"Sound Particle Displacement",
			"Sound particle velocity",
			"Sound power",
			"Sound power level",
			"Sound pressure",
			"Sound pressure level",
			"Sound reduction index",
			"Source Voltage",
			"Source Voltage Between Substances",
			"Spatial Summation Function",
			"Specific Energy",
			"Specific Energy Imparted",
			"Specific Heat Capacity",
			"Specific Heats Ratio",
			"Specific Impulse by Mass",
			"Specific Impulse by Weight",
			"Specific Volume",
			"Speed of Light",
			"Speed of sound",
			"Spin",
			"Stage Propellant Mass",
			"Stage Structure Mass",
			"Standard Chemical Potential",
			"Static Friction",
			"Static Friction Coefficient",
			"Static pressure",
			"Stochastic Process",
			"Strain",
			"Strain Energy Density",
			"Stress",
			"Structural Efficiency",
			"Superconduction Transition Temperature",
			"Superconductor Energy Gap",
			"Surface Tension",
			"Systolic Blood Pressure",
			"Target Bogie Mass",
			"Temperature per Time",
			"Tension",
			"Thermal Admittance",
			"Thermal Diffusivity",
			"Thermal Efficiency",
			"Thermal Energy",
			"Thermal Transmittance",
			"Thermal Utilization Factor For Fission",
			"Thermodynamic Critical Magnetic Flux Density",
			"Thermodynamic Energy",
			"Thickness",
			"Thrust",
			"Thrust To Weight Ratio",
			"Time averaged sound intensity",
			"Time Ratio",
			"Total Angular Momentum",
			"Total Cross-section",
			"Total Pressure",
			"True Exhaust Velocity",
			"Upper Critical Magnetic Flux Density",
			"Vacuum Thrust",
			"Vapor Pressure",
			"Vehicle Velocity",
			"Vertical Velocity",
			"Visible Radiant Energy",
			"Voltage Ratio",
			"Volume Strain",
			"Vorticity",
			"Water Horsepower",
			"Wavelength",
			"Wavenumber",
			"Web Time",
			"Web Time Average Pressure",
			"Web Time Average Thrust",
			"Width",
			"Work",
			"Work Function"
		);

		var writer = new FileWriter(tmpFile.toFile());

		var kinds = new ArrayList<>(Qudt.allQuantityKinds());
		Collections.sort(kinds, new Comparator<QuantityKind>() {
			@Override
			public int compare(QuantityKind o1, QuantityKind o2) {
				return o1.getLabels().iterator().next().getString().compareTo(o2.getLabels().iterator().next().getString());
			}
		});
		for (var kind : kinds) {
			if (ignoredKinds.contains(kind.getLabels().iterator().next().getString())) {
				continue;
			}

			var units = new ArrayList<>(kind.getApplicableUnits());
			Collections.sort(units, new Comparator<Unit>() {
				@Override
				public int compare(Unit o1, Unit o2) {
					return o1.getLabels().iterator().next().getString().compareTo(o2.getLabels().iterator().next().getString());
				}
			});

			if (units.size()<=1) {
				continue;
			}

			var kindName = kind.getLabels().iterator().next().getString();
			var title = String.format("## %s\n\n", kindName);
			writer.write( title);

			writer.write( "| Unit | Symbol |\n");
			writer.write( "| :--- | :--- |\n");

			for (var unit : units) {
				var unitName = unit.getLabels().stream().map(l -> l.getString()).collect(Collectors.joining("<br/>    ~~ OR ~~<br/>"));
				var unitSymbol = unit.getSymbol().orElse("no symbol");
				var line = String.format("| %s | %s |\n", unitName, unitSymbol);
				writer.write( line);
			}
			writer.write( "\n");
		}

		writer.close();

	}


	/**
	 * Used to help generate the documentation
	 * @throws IOException
	 */
	public void printDuplicates() throws IOException {
		var tmpFile = Files.createTempFile("duplicates", ".md");
		log.info("tmpFile: " + tmpFile.toString());

		// 1 - simplify what we need to check against and add to a map
		var map = new HashMap<String, List<String>>();

		var kinds = new ArrayList<>(Qudt.allQuantityKinds());
		Collections.sort(kinds, new Comparator<QuantityKind>() {
			@Override
			public int compare(QuantityKind o1, QuantityKind o2) {
				return o1.getLabels().iterator().next().getString().compareTo(o2.getLabels().iterator().next().getString());
			}
		});

		for (var kind : kinds) {
			var units = new ArrayList<>(kind.getApplicableUnits());
			Collections.sort(units, new Comparator<Unit>() {
				@Override
				public int compare(Unit o1, Unit o2) {
					return o1.getLabels().iterator().next().getString().compareTo(o2.getLabels().iterator().next().getString());
				}
			});

			if (units.size()<=1) {
				continue;
			}

			var kindName = kind.getLabels().iterator().next().getString();
			var unitNames = units.stream().map(u-> u.getLabels().iterator().next().getString()).collect(Collectors.toList());
			map.put(kindName, unitNames);
		}

		// 2 - iterate through the map, checking to see if there are any kinds that have the same units defined
		var keyList = new ArrayList<>(map.keySet());
		var processed = new HashSet<String>();
		var matched = new HashMap<String, List<String>>();
		for(var i = 0; i<keyList.size(); i++) {
			var kind = keyList.get(i);
			if (processed.contains(kind)) {
				continue;
			}
			var units = map.get(kind);
			var matches = new ArrayList<String>();

			// scan all others following to see if we have a match
			for(var x = i+1; x<keyList.size(); x++) {
				var otherKind = keyList.get(x);
				if (processed.contains(otherKind)) {
					continue;
				}
				var otherUnits = map.get(otherKind);
				if (units.equals(otherUnits)) {
					matches.add(otherKind);
					processed.add(otherKind);
				}
			}

			if (matches.size()>0) {
				matched.put(kind, matches);
			}
			processed.add(kind);
		}

		// 3 - write matches to file
		var writer = new FileWriter(tmpFile.toFile());
		for(var kind : matched.keySet()) {
			writer.write(kind + "\n");
			for (var unit : matched.get(kind)) {
				writer.write(unit + "\n");
			}
			writer.write("\n");
		}
		writer.close();

	}


}
